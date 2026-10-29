# Application error monitoring

Web and Android release 1.0.3 reports React route crashes, uncaught JavaScript errors, unhandled promise rejections, network failures and HTTP 5xx responses to `POST /api/client-errors`. API responses include `x-request-id`; frontend HTTP failures include that ID to correlate with server logs. API 4xx/5xx responses and server exceptions are also recorded. Ingestion requires an allowed Origin, validates a bounded schema, accepts no more than 30 reports per minute per source IP, and limits each browser session to 30 reports with 30-second duplicate suppression. Reporting failure never interrupts the application or recursively reports itself.

Reports contain server/client timestamps, release, source, known page path, error name/category and code locations. They exclude raw exception messages, query strings, request/response bodies, headers, cookies, credentials, chat content and form contents. Public pre-login reports are untrusted diagnostics, not authoritative user activity. Blocked/offline clients may not deliver reports; no automatic alert or scheduled monitor is configured.

The API writes JSON lines to `/data/files/diagnostics/errors.jsonl` in the persistent exports volume, surviving app deployments. Rotation retains the current file plus three previous files of about 10 MiB each (roughly 40 MiB total, size-based retention). Files are private and not served publicly. Each event is also emitted at error level to API container logs.

On the server:

```sh
cd /opt/baxter-response/current
docker compose --env-file .env.production -f compose.yml -f compose.postgres.yml -f compose.server.yml exec -T api tail -n 100 /data/files/diagnostics/errors.jsonl
```

To watch new events, use `tail -F` instead of `tail -n 100`. To filter an exported file:

```sh
jq 'select(.event == "client_error")' errors.jsonl
jq 'select(.requestId == "REQUEST_UUID")' errors.jsonl
```

`client_error` identifies browser reports; `server_exception` provides sanitized server locations; `api_failure` gives method, route template, status and duration. A single failure may have all three entries linked by request ID. Keep the matching release's JavaScript assets/source to resolve minified code locations. Previous versions of the installed Android app need updating to send reports.
