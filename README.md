# Baxter Response

An open-source supply-chain response demonstration: EMEA shipment exceptions, impact analysis, guided actions, and a mobile-friendly response workspace. Business data and partner actions are synthetic. Configured OpenAI requests and device pushes use real external services.

## Run locally

Requires Node 24, pnpm 11, and PostgreSQL 16 command-line binaries (`initdb`, `pg_ctl`, `psql`) on PATH.

```sh
git clone https://github.com/karthikbala/baxter.git
cd baxter
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

Open **http://localhost:5180** and choose **Enter as Alex Morgan**. Setup creates an isolated PostgreSQL cluster on `127.0.0.1:57432`, generates private application credentials and VAPID keys, migrates the schema, and seeds 500 demo shipments. Configuration is stored in the ignored `.env.local` file with mode 600. Running setup or seed again replaces the active demo run, preserving device enrollment.

To restart an existing workspace, run `pnpm db:start` followed by `pnpm dev`. Stop the application with Ctrl+C; stop its database with `pnpm db:stop`.

AI, voice, and native push require your own credentials. No OpenAI key or Firebase service account is included. Application credentials stay on the server; keep filled environment files private.

## Features

- Overview, priority queue, searchable shipments, container/reference details, and CSV/Excel exports.
- Cases with evidence timelines, receipt estimates, ownership, reviewed actions, and audit events.
- Stock projection, customer-order exposure, alternate-DC transfers, donor protection, and receipt-based closure.
- Customs document gaps, clearance evidence, free-time exposure, and charge tiers.
- Product/BOM graph, approved sourcing filters, and supplier/route/tariff scenarios.
- Partner metrics and a data-quality review queue.
- OpenAI Responses assistant with scoped evidence, server-controlled draft tools, and editable voice transcription.
- Demo studio with nine scenarios, partner replies, business-clock controls, reset, worker heartbeat, and notification logs.
- Installable PWA, Web Push, and foreground alert tone.

See [the demo guide](docs/demo-guide.md), [architecture](docs/architecture.md), and [data model](docs/data-model.md).

## Validation

```sh
pnpm test
pnpm build
# Requires the running API and changes the local demo:
pnpm exec tsx scripts/verify-http.ts
```

The recovered source passed all 37 tests, the production build, and 26 authenticated HTTP checks on 29 October 2026. These checks use synthetic data. See [validation and limits](docs/validation.md).

## Deployment and Android

Web/API/worker deployment templates support Ubuntu with a private PostgreSQL database. Configure your own host, credentials, and optional Firebase project using [deployment](docs/deployment.md) and [server operations](docs/server-handover.md).

The recovered snapshot includes only the Android app Gradle configuration, not the complete native project, Capacitor configuration, signing material, or APK. `scripts/build-android.mjs` is retained as a reference and requires restoring those missing project files before use. Native push and physical phone delivery are not verified by this source release. See [Android push setup](docs/android-push-setup.md).

## License

[MIT](LICENSE). This is an independent synthetic demonstration; references to Baxter and Miebach describe the demo context. The license does not grant rights to third-party names or trademarks.
