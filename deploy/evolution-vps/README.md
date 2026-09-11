# Evolution API numa VPS Oracle Cloud (standalone)

Pra quando o app Next.js está na Vercel (não self-hosted) e você só precisa de um
servidor separado rodando a Evolution API, que o app acessa via `EVOLUTION_API_BASE_URL`.

## 1. Criar a instância na Oracle Cloud (OCI)

Console → **Compute → Instances → Create Instance**.

- **Image**: Ubuntu 24.04 (Canonical Ubuntu).
- **Shape**: Always Free elegível — `VM.Standard.A1.Flex` (ARM Ampere, até 4 OCPU / 24GB
  no free tier) ou `VM.Standard.E2.1.Micro` (x86, mais fraca). A1.Flex é a recomendada:
  de sobra pra Postgres + Redis + Evolution.
- **Networking**: VCN padrão está OK. Marque "Assign a public IPv4 address".
- **SSH key**: gere um par novo ou cole sua chave pública — vai precisar pra entrar depois.

Depois de criado, anote o **IP público**.

### Abrir as portas (Security List / Network Security Group)

No painel da VCN → Security Lists (ou NSG da instância) → Add Ingress Rules:

| Porta | Origem | Motivo |
|---|---|---|
| 22/tcp | seu IP (ou 0.0.0.0/0 se não tiver IP fixo) | SSH |
| 80/tcp | 0.0.0.0/0 | Caddy — desafio HTTP do Let's Encrypt |
| 443/tcp | 0.0.0.0/0 | Caddy — HTTPS público (é isso que a Vercel vai chamar) |

**Não abra a 8080** — a Evolution só fala com o Caddy pela rede interna do Docker.

O Ubuntu da Oracle também vem com `iptables`/`netfilter` próprio bloqueando por padrão
(além do Security List da OCI) — depois de logar na VPS:

```bash
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save   # ou: sudo iptables-save > /etc/iptables/rules.v4
```

## 2. DNS

Crie um registro **A** pro subdomínio que vai usar (ex. `evolution.seudominio.com`)
apontando pro IP público da instância. Espere propagar antes do passo 4 (o Caddy
falha a emissão do certificado se o DNS ainda não resolver).

## 3. Instalar Docker

```bash
ssh ubuntu@<IP_PUBLICO>
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker
```

## 4. Subir a stack

```bash
git clone --depth 1 https://github.com/melgarafael/DeskcommCRM.git
cd DeskcommCRM/deploy/evolution-vps

cp .env.example .env
# preencha DOMAIN, ACME_EMAIL, EVOLUTION_API_KEY (openssl rand -hex 32),
# EVOLUTION_DB_PASSWORD (openssl rand -hex 16)
nano .env

docker compose up -d
docker compose logs -f caddy    # confirme "certificate obtained successfully"
```

Teste: `curl https://$DOMAIN/instance/fetchInstances -H "apikey: $EVOLUTION_API_KEY"`
— deve responder `[]` (lista vazia, nenhuma instância criada ainda) e não erro de TLS.

## 5. Apontar a Vercel pra cá

```bash
vercel env add EVOLUTION_API_BASE_URL production
# cole: https://evolution.seudominio.com

vercel env add EVOLUTION_API_KEY production
# cole a mesma EVOLUTION_API_KEY do .env acima

vercel --prod   # redeploy pra pegar as env vars novas
```

## Manutenção

- **Atualizar a imagem**: `docker compose pull && docker compose up -d`
- **Backup**: os três volumes nomeados (`evolution-postgres-data`,
  `evolution-redis-data`, `evolution-instances`) — o último guarda a sessão
  WhatsApp conectada; perdê-lo derruba a sessão e exige escanear o QR de novo.
- **Logs**: `docker compose logs -f evolution-api`
