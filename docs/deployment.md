# Ubuntu deployment and phone access

Deployment templates support your own Ubuntu host, HTTPS domain, and private PostgreSQL database. For an existing nginx installation, use the loopback gateway override in `compose.server.yml`. See [server operations](server-handover.md). Configure your own Firebase project if restoring the optional native wrapper.

## Choose PostgreSQL

Recommended hosted option: a Supabase project dedicated to this demo. Use the direct connection when the Ubuntu host supports its network family, or the **session** pooler when required. pg-boss requires a persistent/session connection; do not use transaction pooling. Migrations create `app`, `app_auth`, and `pgboss` private schemas and distinct login roles. The Supabase browser anon/service-role keys are not used.

The supplied `compose.postgres.yml` is an alternative for running PostgreSQL 16 on Ubuntu. Database access is internal to Docker; do not expose port 5432 publicly. Native local development remains on port 57432.

## Prepare private configuration

Copy `.env.example` to `.env.production`, mode 600. Supply:

- `APP_HOST` and `APP_URL` for the actual HTTPS domain; DNS must reach Ubuntu.
- `DATABASE_ADMIN_URL`, used only for migration/seed jobs.
- `AUTH_SECRET`, `DEMO_PASSWORD`, and the three database role passwords. Generate strong random hex strings. Never reuse the development passwords for a real deployment.
- `DATABASE_URL`, `AUTH_DATABASE_URL`, and `QUEUE_DATABASE_URL` using the matching created role passwords. On a Supabase session pooler the username includes the project suffix, such as `baxter_runtime.<project-ref>`; use the project’s actual connection information and TLS settings.
- OpenAI and VAPID values. Preserve VAPID keys if you want existing web subscriptions to stay valid. Changing `AUTH_SECRET` invalidates sessions and encrypted device enrollments.

For the PostgreSQL Compose alternative, use host `postgres`, database `baxter`, admin user `baxter_admin`, and `POSTGRES_PASSWORD`. Runtime users are `baxter_runtime`, `baxter_auth`, and `baxter_queue`.

Production has no quick-entry button. Seed creates Alex (`alex@baxter.example`) and Eva (`eva@baxter.example`) with the configured `DEMO_PASSWORD`. These are synthetic demonstration identities; use proper individual enterprise identities before a real pilot. Public signup remains disabled.

## Build and start

Docker Engine and Compose v2 must be installed on Ubuntu. The generic commands below apply to a dedicated host; a shared server with existing nginx additionally uses `compose.server.yml` to bind the gateway to loopback port 5188 behind nginx.

```sh
docker compose --env-file .env.production build
docker compose --env-file .env.production run --rm migrate
docker compose --env-file .env.production run --rm seed
docker compose --env-file .env.production up -d api worker gateway
```

For the optional container database, use `docker compose --env-file .env.production -f compose.yml -f compose.postgres.yml` for each command, and start `postgres` before running migration/seed. Caddy automatically requests certificates for the configured domain and proxies `/api/*` to Fastify. Export files use a persistent private volume.

The migration command updates role passwords from configuration. Keep the derived runtime URLs consistent. The API and worker receive explicit per-service secrets; the admin URL is supplied only to migration/seed jobs. Restrict file access and never bake filled env files or Firebase credentials into the image.

## Native Android push

The recovered Android project is incomplete. Restore the missing native and Capacitor project files before following these steps; see [Android push setup](android-push-setup.md).

1. Register Android package `com.miebach.baxter.response` in the chosen Firebase project.
2. Put the project’s Android `google-services.json` in `android/app/`; it is ignored by Git.
3. Put a least-privilege server Firebase credential at `deploy/secrets/firebase-service-account.json` and configure `FCM_CREDENTIALS_PATH=/run/secrets/firebase-service-account.json`. Both platform files must belong to the same project.
4. Rebuild with `node scripts/build-android.mjs`. Install the debug APK through a trusted local connection for rehearsal. A production release needs your own signing key and distribution process.
5. Open the APK, enter the real HTTPS workspace URL, and sign in. Enable notifications. The app creates the critical channel before FCM delivery and uses `res/raw/critical_alert.wav`.
6. Send a test and verify the physical phone. A compiled APK or provider acceptance is insufficient evidence of a displayed notification or audible tone.

Channel preferences are owned by Android once created. If a user changed the channel to silent, the application must respect that setting; use Android settings to restore it. The app cannot bypass Do Not Disturb. For a later sound change, migrate to a newly named channel deliberately.

## Local phone rehearsal without hosted application services

Use a trusted local HTTPS reverse proxy to the laptop, with a certificate the phone trusts and an address it can reach. Configure the exact origin as `APP_URL` and restart API/worker. Caddy can issue a local CA certificate, but that CA must be installed and trusted on the phone. This is a manual device trust step; no certificate was installed on your devices during development.

For a temporary LAN demonstration, a trusted external tunnel may be used if you choose one. No tunnel or cloud hosting was created by this work. The Ubuntu deployment is the straightforward route once the host and domain are available.

## Operations

- `/api/health` checks API/database availability; Demo studio reports the worker’s recent heartbeat.
- Keep PostgreSQL, exports, and encryption/VAPID keys together in backup planning. `scripts/backup.mjs` uses `pg_dump` with the URL in its process environment, not printed in the command log.
- Test restore to an isolated database before relying on backup. No production restore drill has occurred.
- Rehearse browser/device enrollment after any domain change. Web Push permissions and subscriptions are origin-specific.

Sources: [Supabase connection modes](https://supabase.com/docs/guides/database/connecting-to-postgres), [Capacitor Android environment](https://capacitorjs.com/docs/getting-started/environment-setup), [Capacitor push notifications](https://capacitorjs.com/docs/apis/push-notifications).
