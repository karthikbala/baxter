# Database model

The foundation uses private PostgreSQL schemas. Business records carry `tenant_id`, `run_id`, `id`, `created_at`, and an explicit synthetic-data flag. Composite foreign keys keep references within the same tenant and demo run. All runtime access uses transaction-local tenant context and row-level security.

The operational seed contains 500 shipments, 800 container trips, 200 products, 35 initial cases, 640 stock positions, and 38,400 demand buckets across 8 DCs and 60 days. Ports, suppliers, carriers, contacts, values, references, and documents are fictional. The seed anchor is the current UTC date at 08:00.

## Core relationships

Shipment → container trip links, legs, source observations, milestone revisions, original ETA baselines, and issuer-scoped document references. Commercial document lines connect purchase orders to customer-order lines; allocations permit one order to span multiple trips.

Exception case → evidence events, impacted entities, assessment snapshots, action proposals, approval versions, planning decisions, communications, follow-up timers, and notification events. Acknowledgement and resolution are separate.

SKU/site inventory + demand + inbound plans → stock projection and exposure. Donor reservations and protection requirements constrain recovery. BOM versions/components + approved sources → hypothetical network analysis.

## Tables

| Table                           | Purpose / structure       |
| ------------------------------- | ------------------------- |
| `app.tenants`                   | Tenants                   |
| `app.memberships`               | Memberships               |
| `app.demo_runs`                 | Demo runs                 |
| `app.parties`                   | Parties                   |
| `app.contacts`                  | Contacts                  |
| `app.locations`                 | Locations                 |
| `app.lanes`                     | Lanes                     |
| `app.calendars`                 | Calendars                 |
| `app.calendar_dates`            | Calendar dates            |
| `app.products`                  | Products                  |
| `app.unit_conversions`          | Unit conversions          |
| `app.bom_versions`              | Bom versions              |
| `app.bom_components`            | Bom components            |
| `app.sourcing_options`          | Sourcing options          |
| `app.capacity_buckets`          | Capacity buckets          |
| `app.valuation_inputs`          | Valuation inputs          |
| `app.fx_rates`                  | Fx rates                  |
| `app.business_documents`        | Business documents        |
| `app.business_document_lines`   | Business document lines   |
| `app.document_line_links`       | Document line links       |
| `app.shipments`                 | Shipments                 |
| `app.shipment_legs`             | Shipment legs             |
| `app.container_trips`           | Container trips           |
| `app.shipment_container_links`  | Shipment container links  |
| `app.shipment_line_allocations` | Shipment line allocations |
| `app.external_references`       | External references       |
| `app.reference_matches`         | Reference matches         |
| `app.documents`                 | Documents                 |
| `app.integration_connections`   | Integration connections   |
| `app.ingestion_runs`            | Ingestion runs            |
| `app.source_observations`       | Source observations       |
| `app.milestone_events`          | Milestone events          |
| `app.eta_baselines`             | Eta baselines             |
| `app.data_quality_issues`       | Data quality issues       |
| `app.customs_cases`             | Customs cases             |
| `app.customs_requirements`      | Customs requirements      |
| `app.charge_rules`              | Charge rules              |
| `app.charge_tiers`              | Charge tiers              |
| `app.charge_calculations`       | Charge calculations       |
| `app.actual_charges`            | Actual charges            |
| `app.inventory_positions`       | Inventory positions       |
| `app.demand_buckets`            | Demand buckets            |
| `app.inventory_reservations`    | Inventory reservations    |
| `app.inbound_plans`             | Inbound plans             |
| `app.planning_options`          | Planning options          |
| `app.planning_decisions`        | Planning decisions        |
| `app.network_scenarios`         | Network scenarios         |
| `app.scenario_results`          | Scenario results          |
| `app.exception_rules`           | Exception rules           |
| `app.playbooks`                 | Playbooks                 |
| `app.exception_cases`           | Exception cases           |
| `app.case_entities`             | Case entities             |
| `app.case_events`               | Case events               |
| `app.impact_assessments`        | Impact assessments        |
| `app.actions`                   | Actions                   |
| `app.approvals`                 | Approvals                 |
| `app.scheduled_jobs`            | Scheduled jobs            |
| `app.communications`            | Communications            |
| `app.outbox_jobs`               | Outbox jobs               |
| `app.assistant_threads`         | Assistant threads         |
| `app.assistant_messages`        | Assistant messages        |
| `app.assistant_tool_runs`       | Assistant tool runs       |
| `app.voice_utterances`          | Voice utterances          |
| `app.audit_events`              | Audit events              |
| `app.devices`                   | Devices                   |
| `app.notification_preferences`  | Notification preferences  |
| `app.notifications`             | Notifications             |
| `app.notification_attempts`     | Notification attempts     |
| `app.notification_events`       | Notification events       |
| `app.seed_manifests`            | Seed manifests            |
| `app.scenario_templates`        | Scenario templates        |
| `app.demo_commands`             | Demo commands             |
| `app.device_enrollments`        | Device enrollments        |
| `app.export_jobs`               | Export jobs               |
| `app.domain_outbox`             | Domain outbox             |

Additional schema: `app.service_heartbeats` stores per-tenant worker liveness. Better Auth uses private `app_auth.user`, `session`, `account`, and `verification`. pg-boss owns its `pgboss` schema.

The authoritative column definitions and constraints are the reviewed SQL in `supabase/migrations/`. `scripts/schema-definition.mjs` documents the foundation generation; never regenerate or edit an already-applied migration. Add a new versioned migration instead.

The initial seed leaves event/output tables empty until their workflow is exercised. That is intentional: a sent-message or delivery record is created only by an actual simulated business operation or real provider response.
