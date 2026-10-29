# Requirement coverage

Source: the supplied Baxter/Miebach case-study PDF, reviewed in the planning documents under `outputs/`. The demo is a standalone product; Hercules is an optional future integration.

| Business problem / requested feature                          | Implemented demonstration                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Teams discover shipment delays too late                       | ETA baseline/revisions → critical case → owner notification → action preview                                       |
| Different 3PL formats and weak reference linkage              | Source-observation records, issuer-scoped references, multi-candidate review, cancelled revisions retained         |
| Arrival conflated with customs start/clearance/final delivery | Separate fields and milestone qualifiers; an unknown start remains unknown                                         |
| Free-time and demurrage costs                                 | Container count, calendar-day free-time fixture, stored tier calculation and separate actual-charge table          |
| Unclear ownership and overdue responses                       | Case owner, planner assignment, acknowledgement, two-hour follow-up jobs and escalation audit trail                |
| Missing paperwork and follow-up emails                        | Document requirement status, scoped document evidence, prepared email, reviewed simulated outbox and partner reply |
| Shipment late but business impact unclear                     | Inventory/demand/inbound projection, SKU and DC context, linked customer-order exposure                            |
| Shared orders overcount exposure                              | Two-trip shared-order fixture reconciled once at customer-line grain                                               |
| Actionable replenishment options                              | Utrecht transfer constrained by commitments/protection, manager approval, receipt-based closure                    |
| Provider/distributor performance reporting                    | Shared synthetic provider cohort, shipment/delivery counts, mean positive ETA drift, recorded replies              |
| Network/BOM/single-source risk                                | Multi-level dependency graph, active approved-source counts, supplier interruption scenario                        |
| Route/tariff scenario comparison                              | Saved what-if results with input assumptions and illustrative costs; no live tariff feed                           |
| Data completeness and evidence confidence                     | Stale-feed issue, missing timestamps, reference review, cancelled-event visibility                                 |
| Web and mobile                                                | Responsive desktop workspace and installable PWA with mobile navigation and agent interface                        |
| Voice interaction                                             | OpenAI WebRTC transcription, microphone control, editable transcript, typed fallback                               |
| Critical push demonstration                                   | Presenter trigger, repeat push, countdown, queue/provider/client logs, PWA support, Android sound channel          |
| All database tables and mock data                             | Versioned SQL, 76 private application tables including service heartbeat, deterministic run-scoped seed            |
| Locally developed, later Ubuntu                               | Isolated PostgreSQL, local web/API/worker, Docker/Caddy definitions and Supabase connection path                   |

These are demonstration implementations, not a validated production optimisation engine. Supplier/route costs and capacity are fixture-based screening assumptions. Live carrier/ERP/Hercules ingestion, enterprise SSO, verified tariff/commercial inputs, and real partner delivery require integrations and operational validation in the pilot. No patient data is included.
