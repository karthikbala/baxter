# Server operations

Deploy using your own HTTPS domain and private configuration. The repository contains no shared demo credentials or hosted access details. See [deployment](deployment.md) for configuration and build steps.

## Services

Compose runs API, worker, gateway, and optionally PostgreSQL 16. `compose.server.yml` binds the gateway to `127.0.0.1:5188` for an existing nginx reverse proxy. Adjust its worker credential mount to your own private Firebase directory. Use the nginx templates in `deploy/` with your domain and certificate locations.

From your deployment checkout:

```sh
docker compose --env-file .env.production -f compose.yml -f compose.postgres.yml -f compose.server.yml ps
docker compose --env-file .env.production -f compose.yml -f compose.postgres.yml -f compose.server.yml logs --tail 100 api worker
```

The API health endpoint checks database connectivity. Demo studio exposes worker heartbeat and notification status. Provider acceptance does not establish physical device delivery.

## Updates and data

Back up PostgreSQL, export files, and private configuration before migrations. Build a new release, apply reviewed migrations, and switch traffic only after health and authenticated checks pass. Retain the prior release for rollback; schema changes require a compatible rollback plan.

Do not use `down -v` on a database whose data you need. Seeding replaces the active demo run. Preserve encryption and VAPID keys with backups, and test restoration in an isolated environment.

The certificate renewal service and timer in `deploy/` are templates. Adapt and validate their paths, webroot, and renewal behaviour for your server. No hosted availability, certificate status, or backup schedule is asserted by this repository.
