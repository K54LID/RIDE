# RIDE

Telegram Mini App. Monorepo: Fastify API + React web client, deployed to
a Hostinger VPS via Coolify.

## Layout

    apps/api    Fastify server (TypeScript, ESM)
    apps/web    React client, built to static assets, served by nginx
    db/migrations  Ordered SQL migrations

## Domains

    https://ridethatbot.fun   Mini App URL registered with BotFather
    https://ridethatbot.fun   API + Telegram webhook
    media.ridethatbot.fun Cloudflare R2 public bucket

## Non-negotiable invariants

1. `telegram_identities` is never joined to in any query that produces a
   public response. Telegram usernames are not stored at all.
2. Coordinates are snapped to a grid before insert. Precise positions are
   never persisted; clients receive distance buckets, never metres.
3. `coin_ledger` is append-only. `coin_balances` is a cache and can be
   rebuilt with `SUM(delta)`. Never write a balance directly.
4. No health data is collected.
5. Age gate is enforced by a CHECK constraint, not just UI validation.

## Local development

    cp .env.example .env      # fill in values
    npm install
    npm run dev

## Deployment

Push to `main`. Coolify's GitHub webhook rebuilds and redeploys from
`docker-compose.yml`. Set FQDNs in the Coolify UI so certificate renewal
stays automatic — do not hardcode Traefik labels.
