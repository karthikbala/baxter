# Validation record

The recovered source was checked locally on 29 October 2026. All business records were synthetic and stored in an isolated local PostgreSQL 16 cluster.

## Passed

- `pnpm build`: TypeScript checking and production builds for the web application, API, and worker.
- `pnpm test`: 37 tests across seven files, including calculations, database workflows, session handling, assistant interactions, diagnostics, and voice UI behaviour.
- `pnpm exec tsx scripts/verify-http.ts`: 26 checks covering local demo sign-in, authenticated routes, access/origin rejection, stale-run rejection, invalid push endpoints, demo scenarios, and CSV/Excel exports.
- Browser sign-in and overview rendering with 500 shipments and 35 initial cases.
- Local health endpoint and API, worker, web, and PostgreSQL startup.

Verification reports, screenshots, generated databases, and credentials are intentionally excluded from Git. The local demo was reseeded after the HTTP checks.

## Limits

No live OpenAI smoke test, voice transcription request, Firebase authorization test, physical device push, Android build, deployment, load test, or backup/restore drill was performed for this source release. AI and native push require separate credentials. The recovered Android project is incomplete; see [Android push setup](android-push-setup.md).

Real ERP/carrier ingestion, enterprise SSO, live tariffs, and real partner communications remain outside the demonstration. The source and test results do not establish production acceptance on Baxter systems.

Other release notes describe historical implementation work; their original generated evidence and native build artifacts are not part of this repository.
