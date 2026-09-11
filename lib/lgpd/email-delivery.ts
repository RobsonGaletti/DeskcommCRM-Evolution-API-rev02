/**
 * LGPD export email delivery (Resend).
 *
 * NEVER logs the recipient address in plaintext (CLAUDE.md §LGPD L-08).
 * Only sha256(email) appears in logs/audit metadata.
 */

import { createHash } from "node:crypto";

import { sendEmail } from "@/lib/email/resend";

export class EmailNotConfigured extends Error {
  constructor() {
    super("RESEND_API_KEY missing or invalid");
    this.name = "EmailNotConfigured";
  }
}

export class EmailSendFailed extends Error {
  constructor(detail: string) {
    super(`Resend send failed: ${detail}`);
    this.name = "EmailSendFailed";
  }
}

export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

interface SendArgs {
  to: string;
  requestId: string;
  signedUrl: string;
  expiresAt: Date;
  organizationName?: string;
}

export async function sendExportEmail(args: SendArgs): Promise<{ messageId: string }> {
  const shortId = args.requestId.slice(0, 8);
  const orgName = args.organizationName ?? "DeskcommCRM";
  const expiresFmt = args.expiresAt.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });

  const subject = `Sua solicitação LGPD #${shortId}`;

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111827;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 12px;font-size:18px;">Solicitação LGPD #${shortId} processada</h2>
  <p>Olá,</p>
  <p>Sua solicitação de acesso aos dados pessoais (LGPD Art. 18, II) foi processada por <strong>${orgName}</strong>.</p>
  <p>O relatório completo está disponível para download no link abaixo. Por motivos de segurança, o link expira em <strong>${expiresFmt}</strong>.</p>
  <p style="margin:24px 0;">
    <a href="${args.signedUrl}" style="background:#111827;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;">Baixar relatório LGPD</a>
  </p>
  <p style="font-size:12px;color:#6b7280;">Se você não solicitou este relatório, ignore este email — nenhum dado adicional é compartilhado.</p>
  <p style="font-size:12px;color:#6b7280;">Base legal: LGPD Lei nº 13.709/2018, Art. 18, II.</p>
</body>
</html>`;

  const text = `Solicitação LGPD #${shortId} processada por ${orgName}.

O relatório completo está disponível em:
${args.signedUrl}

O link expira em ${expiresFmt}.

Se você não solicitou este relatório, ignore este email.
Base legal: LGPD Lei nº 13.709/2018, Art. 18, II.`;

  const result = await sendEmail({
    to: args.to,
    subject,
    html,
    text,
    tags: [
      { name: "kind", value: "lgpd_export" },
      { name: "request_short", value: shortId },
    ],
  });

  if (!result.ok) {
    if (result.error === "not_configured") {
      throw new EmailNotConfigured();
    }
    throw new EmailSendFailed(result.details ?? result.error ?? "unknown");
  }

  return { messageId: result.id ?? "unknown" };
}
