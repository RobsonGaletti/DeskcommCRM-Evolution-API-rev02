/**
 * Per-tenant rate limit for agent dispatch (S-13.07).
 *
 * Fixed-window counter on Upstash Redis: `ai-runs:<org>:<window-start>` with
 * INCR + EXPIRE. Sub-minute granularity is good enough for the 60/min default
 * and avoids pulling in `@upstash/ratelimit` (no new deps for this wave).
 *
 * In-memory fallback mirrors `lib/ai/rag/debounce.ts` — loud warn so operators
 * notice when Redis is misconfigured and the limit is effectively per-instance.
 */

import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

let _redis: Redis | null = null;
let _fallbackWarned = false;

function getRedis(): Redis | null {
  if (_redis) return _redis;
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!_fallbackWarned) {
      logger.warn("[ai-dispatcher.rate-limit] Redis missing — using in-memory fallback (not safe for multi-instance)");
      _fallbackWarned = true;
    }
    return null;
  }
  // `retry: false`: com Redis inalcançável (URL errada, rede caída), o default
  // do SDK re-tenta com backoff e cada chamada passa a custar SEGUNDOS. Como
  // já existe fallback em memória logo abaixo, retentar aqui só transfere a
  // indisponibilidade do Redis para a latência do login. Falhe rápido e caia
  // para a memória. Medido: com URL morta, duas chamadas somavam ~8s numa
  // requisição de recuperação de senha, estourando o timeout da tela.
  _redis = new Redis({ url, token, retry: false });
  return _redis;
}

interface MemBucket {
  count: number;
  expiresAt: number;
}
const _memBuckets = new Map<string, MemBucket>();

function memIncrement(key: string, windowSec: number): number {
  const now = Date.now();
  const existing = _memBuckets.get(key);
  if (!existing || existing.expiresAt <= now) {
    _memBuckets.set(key, { count: 1, expiresAt: now + windowSec * 1000 });
    return 1;
  }
  existing.count += 1;
  return existing.count;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  window_sec: number;
}

/**
 * Increments the per-tenant counter for the current window and returns whether
 * the call is below the limit. Counter expires automatically — no cleanup
 * needed beyond Redis TTL.
 */
export async function checkRateLimit(
  bucket: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const windowStart = Math.floor(Date.now() / (windowSec * 1000));
  const key = `${bucket}:${windowStart}`;

  const redis = getRedis();
  let count: number;
  if (!redis) {
    count = memIncrement(key, windowSec);
  } else {
    try {
      count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSec);
      }
    } catch (err) {
      logger.warn("[ai-dispatcher.rate-limit] redis incr failed; falling back to in-memory", {
        error: err instanceof Error ? err.message : String(err),
        bucket,
      });
      count = memIncrement(key, windowSec);
    }
  }

  return {
    allowed: count <= limit,
    count,
    limit,
    window_sec: windowSec,
  };
}

/**
 * Lê o contador SEM incrementar (issue #64).
 *
 * Existe porque bloqueio por tentativa-que-falhou precisa de duas operações
 * distintas: *consultar* antes de chamar o provedor (senão o ataque nunca é
 * barrado antes de acontecer) e *incrementar* só quando a tentativa falha
 * (senão login bem-sucedido consome o orçamento e tranca quem acertou a senha).
 */
export async function peekRateLimit(bucket: string, windowSec: number): Promise<number> {
  const windowStart = Math.floor(Date.now() / (windowSec * 1000));
  const key = `${bucket}:${windowStart}`;

  const redis = getRedis();
  if (!redis) {
    const existing = _memBuckets.get(key);
    return !existing || existing.expiresAt <= Date.now() ? 0 : existing.count;
  }
  try {
    const value = await redis.get<number | string>(key);
    return value == null ? 0 : Number(value);
  } catch {
    const existing = _memBuckets.get(key);
    return !existing || existing.expiresAt <= Date.now() ? 0 : existing.count;
  }
}
