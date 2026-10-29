import { writeFileSync } from "node:fs";
const definitions = {
  parties: [
    "name text not null, kind text not null, country text, score numeric, metadata jsonb not null default '{}'",
  ],
  contacts: [
    "party_id uuid, name text not null, email text not null, title text, escalation_level int default 0",
    { party_id: "parties" },
  ],
  locations: [
    "name text not null, city text, country text not null, kind text not null, timezone text not null, lat numeric, lon numeric, party_id uuid",
    { party_id: "parties" },
  ],
  lanes: [
    "origin_id uuid, destination_id uuid, provider_id uuid, mode text not null, transit_days int, capacity numeric, cost numeric, currency text default 'EUR'",
    {
      origin_id: "locations",
      destination_id: "locations",
      provider_id: "parties",
    },
  ],
  calendars: [
    "name text not null, timezone text not null, working_weekdays int[] not null default '{1,2,3,4,5}'",
  ],
  calendar_dates: [
    "calendar_id uuid, date date not null, is_working boolean not null, reason text",
    { calendar_id: "calendars" },
  ],
  products: [
    "code text not null, name text not null, kind text not null, unit text not null default 'unit', criticality text default 'standard', unit_price numeric not null default 0, hs_code text, metadata jsonb not null default '{}'",
  ],
  unit_conversions: [
    "product_id uuid, from_unit text, to_unit text, factor numeric check(factor>0)",
    { product_id: "products" },
  ],
  bom_versions: [
    "product_id uuid not null, version int not null, valid_from date, valid_to date, active boolean default true",
    { product_id: "products" },
  ],
  bom_components: [
    "bom_id uuid not null, component_id uuid not null, quantity numeric not null check(quantity>0), yield_factor numeric not null default 1 check(yield_factor>0 and yield_factor<=1)",
    { bom_id: "bom_versions", component_id: "products" },
  ],
  sourcing_options: [
    "product_id uuid, supplier_id uuid, site_id uuid, approved boolean not null, active boolean not null, capacity numeric, lead_days int, unit_cost numeric",
    { product_id: "products", supplier_id: "parties", site_id: "locations" },
  ],
  capacity_buckets: [
    "site_id uuid, product_id uuid, date date, available numeric, reserved numeric default 0",
    { site_id: "locations", product_id: "products" },
  ],
  valuation_inputs: [
    "product_id uuid, site_id uuid, unit_cost numeric, contribution numeric, currency text default 'EUR', valid_from date",
    { product_id: "products", site_id: "locations" },
  ],
  fx_rates: [
    "from_currency text, to_currency text, rate numeric check(rate>0), as_of date",
  ],
  business_documents: [
    "kind text not null, reference text not null, party_id uuid, currency text default 'EUR', issued_at timestamptz, total numeric",
    { party_id: "parties" },
  ],
  business_document_lines: [
    "document_id uuid not null, product_id uuid not null, line_number int, quantity numeric not null check(quantity>=0), unit_price numeric not null default 0, required_at timestamptz, destination_id uuid",
    {
      document_id: "business_documents",
      product_id: "products",
      destination_id: "locations",
    },
  ],
  document_line_links: [
    "source_id uuid not null, target_id uuid not null, quantity numeric not null check(quantity>=0)",
    {
      source_id: "business_document_lines",
      target_id: "business_document_lines",
    },
  ],
  shipments: [
    "reference text not null, origin_id uuid not null, destination_id uuid not null, provider_id uuid not null, owner_name text not null, owner_user_id text, mode text not null default 'Ocean', status text not null, baseline_eta timestamptz not null, port_eta timestamptz, delivery_eta timestamptz not null, usable_eta timestamptz not null, required_at timestamptz, vessel text, quantity numeric not null, product_id uuid not null, value numeric not null, currency text default 'EUR', last_observed_at timestamptz, metadata jsonb not null default '{}', version int not null default 1",
    {
      origin_id: "locations",
      destination_id: "locations",
      provider_id: "parties",
      product_id: "products",
    },
  ],
  shipment_legs: [
    "shipment_id uuid not null, sequence int not null, origin_id uuid, destination_id uuid, mode text, estimated_at timestamptz, actual_at timestamptz",
    {
      shipment_id: "shipments",
      origin_id: "locations",
      destination_id: "locations",
    },
  ],
  container_trips: [
    "reference text not null, equipment text not null default '40HC', vessel text, voyage text, status text, free_until timestamptz",
  ],
  shipment_container_links: [
    "shipment_id uuid not null, container_id uuid not null, quantity numeric not null",
    { shipment_id: "shipments", container_id: "container_trips" },
  ],
  shipment_line_allocations: [
    "shipment_id uuid not null, line_id uuid not null, container_id uuid, quantity numeric not null check(quantity>=0)",
    {
      shipment_id: "shipments",
      line_id: "business_document_lines",
      container_id: "container_trips",
    },
  ],
  external_references: [
    "shipment_id uuid, document_id uuid, issuer text not null, kind text not null, value text not null, verified boolean not null default true",
    { shipment_id: "shipments", document_id: "business_documents" },
  ],
  reference_matches: [
    "reference_id uuid not null, candidate_shipment_id uuid, status text not null, evidence text, reviewed_by text",
    { reference_id: "external_references", candidate_shipment_id: "shipments" },
  ],
  documents: [
    "shipment_id uuid, case_id uuid, name text not null, kind text not null, mime_type text, file_key text, content text, extracted jsonb, status text",
    { shipment_id: "shipments", case_id: "exception_cases" },
  ],
  integration_connections: [
    "name text not null, provider_id uuid, mode text not null default 'simulator', status text not null, last_success_at timestamptz, mapping_version int default 1",
    { provider_id: "parties" },
  ],
  ingestion_runs: [
    "connection_id uuid, state text not null, started_at timestamptz, finished_at timestamptz, records int, error text",
    { connection_id: "integration_connections" },
  ],
  source_observations: [
    "connection_id uuid, shipment_id uuid, external_id text not null, payload jsonb not null, occurred_at timestamptz, source_observed_at timestamptz, ingested_at timestamptz not null default now()",
    { connection_id: "integration_connections", shipment_id: "shipments" },
  ],
  milestone_events: [
    "shipment_id uuid not null, kind text not null, qualifier text not null check(qualifier in ('planned','estimated','actual')), occurred_at timestamptz, observed_at timestamptz not null, location_id uuid, source_id uuid, cancelled boolean not null default false, revision int not null default 1, detail text",
    {
      shipment_id: "shipments",
      location_id: "locations",
      source_id: "source_observations",
    },
  ],
  eta_baselines: [
    "shipment_id uuid not null, milestone text not null, eta timestamptz not null, frozen_at timestamptz not null",
    { shipment_id: "shipments" },
  ],
  data_quality_issues: [
    "shipment_id uuid, connection_id uuid, reference_id uuid, kind text not null, severity text, title text not null, detail text, status text not null default 'open', resolution text, resolved_by text",
    {
      shipment_id: "shipments",
      connection_id: "integration_connections",
      reference_id: "external_references",
    },
  ],
  customs_cases: [
    "shipment_id uuid not null, broker_id uuid, arrival_at timestamptz, started_at timestamptz, cleared_at timestamptz, status text not null, responsible_name text, free_until timestamptz, cause text",
    { shipment_id: "shipments", broker_id: "parties" },
  ],
  customs_requirements: [
    "customs_id uuid not null, name text not null, status text not null, due_at timestamptz, evidence_id uuid",
    { customs_id: "customs_cases", evidence_id: "documents" },
  ],
  charge_rules: [
    "name text not null, kind text not null, free_days int not null, calendar_basis text not null, arrival_day_included boolean not null, currency text not null",
  ],
  charge_tiers: [
    "rule_id uuid not null, from_day int not null, to_day int, rate numeric not null check(rate>=0)",
    { rule_id: "charge_rules" },
  ],
  charge_calculations: [
    "shipment_id uuid not null, rule_id uuid not null, charge_days int not null, units int not null, amount numeric not null, breakdown jsonb not null, calculated_at timestamptz not null",
    { shipment_id: "shipments", rule_id: "charge_rules" },
  ],
  actual_charges: [
    "shipment_id uuid not null, document_id uuid, gross numeric not null, credit numeric not null default 0, net numeric not null, currency text not null, status text not null, attribution text",
    { shipment_id: "shipments", document_id: "documents" },
  ],
  inventory_positions: [
    "site_id uuid not null, product_id uuid not null, quantity numeric not null check(quantity>=0), reserved numeric not null default 0, status text not null, lot text, as_of timestamptz not null",
    { site_id: "locations", product_id: "products" },
  ],
  demand_buckets: [
    "site_id uuid not null, product_id uuid not null, date date not null, quantity numeric not null check(quantity>=0), basis text not null",
    { site_id: "locations", product_id: "products" },
  ],
  inventory_reservations: [
    "site_id uuid, product_id uuid, line_id uuid, quantity numeric not null, kind text",
    {
      site_id: "locations",
      product_id: "products",
      line_id: "business_document_lines",
    },
  ],
  inbound_plans: [
    "shipment_id uuid, product_id uuid not null, destination_id uuid not null, quantity numeric not null, usable_at timestamptz not null, kind text not null, status text not null",
    {
      shipment_id: "shipments",
      product_id: "products",
      destination_id: "locations",
    },
  ],
  planning_options: [
    "case_id uuid, shipment_id uuid, kind text not null, title text not null, quantity numeric not null, arrival_at timestamptz, cost numeric not null, feasible boolean not null, reason text, inputs jsonb not null",
    { case_id: "exception_cases", shipment_id: "shipments" },
  ],
  planning_decisions: [
    "option_id uuid not null, action_id uuid, status text not null, decided_by text, evidence text",
    { option_id: "planning_options", action_id: "actions" },
  ],
  network_scenarios: [
    "name text not null, kind text not null, inputs jsonb not null, status text not null, created_by text",
  ],
  scenario_results: [
    "scenario_id uuid not null, product_id uuid, result jsonb not null",
    { scenario_id: "network_scenarios", product_id: "products" },
  ],
  exception_rules: [
    "code text not null, name text not null, conditions jsonb not null, enabled boolean not null default true, version int default 1",
  ],
  playbooks: [
    "code text not null, name text not null, steps jsonb not null, owner_role text not null",
  ],
  exception_cases: [
    "reference text not null, shipment_id uuid, kind text not null, title text not null, summary text not null, severity text not null check(severity in ('critical','high','medium','low')), state text not null check(state in ('new','owned','waiting','escalated','resolved')), owner_name text not null, owner_user_id text, due_at timestamptz not null, acknowledged_at timestamptz, resolved_at timestamptz, exposure numeric not null default 0, shortage_units numeric not null default 0, gap_days int not null default 0, next_action text, version int not null default 1",
    { shipment_id: "shipments" },
  ],
  case_entities: [
    "case_id uuid not null, entity_type text not null, entity_id uuid not null",
    { case_id: "exception_cases" },
  ],
  case_events: [
    "case_id uuid not null, kind text not null, actor text not null, title text not null, detail text, payload jsonb not null default '{}', business_at timestamptz not null",
    { case_id: "exception_cases" },
  ],
  impact_assessments: [
    "case_id uuid not null, shipment_id uuid, calculation_version text not null, inputs jsonb not null, result jsonb not null, calculated_at timestamptz not null",
    { case_id: "exception_cases", shipment_id: "shipments" },
  ],
  actions: [
    "case_id uuid not null, kind text not null, title text not null, payload jsonb not null, status text not null, version int not null default 1, due_at timestamptz, created_by text not null, executed_at timestamptz, result jsonb",
    { case_id: "exception_cases" },
  ],
  approvals: [
    "action_id uuid not null, action_version int not null, decision text not null, actor text not null, payload_hash text not null",
    { action_id: "actions" },
  ],
  scheduled_jobs: [
    "case_id uuid, action_id uuid, kind text not null, clock_domain text not null, due_at timestamptz not null, status text not null, operation_key text not null",
    { case_id: "exception_cases", action_id: "actions" },
  ],
  communications: [
    "case_id uuid not null, action_id uuid, direction text not null, recipient text not null, subject text not null, body text not null, status text not null, simulated boolean not null default true, extracted jsonb",
    { case_id: "exception_cases", action_id: "actions" },
  ],
  outbox_jobs: [
    "communication_id uuid not null, status text not null, attempts int not null default 0, result jsonb",
    { communication_id: "communications" },
  ],
  assistant_threads: [
    "case_id uuid, user_id text not null, title text not null",
    { case_id: "exception_cases" },
  ],
  assistant_messages: [
    "thread_id uuid not null, role text not null, content text not null, cards jsonb, evidence_ids uuid[], model text",
    { thread_id: "assistant_threads" },
  ],
  assistant_tool_runs: [
    "thread_id uuid not null, tool text not null, args jsonb not null, result jsonb, status text not null",
    { thread_id: "assistant_threads" },
  ],
  voice_utterances: [
    "thread_id uuid, user_id text not null, transcript text, reviewed_text text, status text not null, metadata jsonb",
    { thread_id: "assistant_threads" },
  ],
  audit_events: [
    "actor text not null, operation text not null, entity_id uuid, metadata jsonb not null",
  ],
  devices: [
    "user_id text not null, label text not null, platform text not null, channel text not null check(channel in ('web','native')), credential jsonb not null, active boolean not null default true, last_seen_at timestamptz not null",
  ],
  notification_preferences: [
    "user_id text not null, critical boolean not null default true, quiet_hours jsonb, audio_enabled boolean default false",
  ],
  notifications: [
    "case_id uuid, user_id text, title text not null, body text not null, severity text not null, status text not null, dedupe_key text not null, expires_at timestamptz not null, link text not null",
    { case_id: "exception_cases" },
  ],
  notification_attempts: [
    "notification_id uuid not null, device_id uuid, status text not null, provider text, error_code text, provider_id text",
    { notification_id: "notifications", device_id: "devices" },
  ],
  notification_events: [
    "notification_id uuid not null, device_id uuid, kind text not null, provenance text not null",
    { notification_id: "notifications", device_id: "devices" },
  ],
  seed_manifests: [
    "version text not null, counts jsonb not null, parameters jsonb not null",
  ],
  scenario_templates: [
    "code text not null, name text not null, description text not null, severity text not null, steps jsonb not null",
  ],
  demo_commands: [
    "command_id text not null, scenario text not null, actor text not null, status text not null, result jsonb",
  ],
  device_enrollments: [
    "token_hash text not null, user_id text not null, expires_at timestamptz not null, consumed_at timestamptz",
  ],
  export_jobs: [
    "user_id text not null, kind text not null, format text not null, filters jsonb not null, status text not null, file_key text, row_count int",
  ],
  domain_outbox: [
    "event_type text not null, payload jsonb not null, operation_key text not null, status text not null default 'pending', processed_at timestamptz",
  ],
};
let sql =
  "create schema if not exists app;\ncreate schema if not exists app_auth;\n";
sql +=
  "create table app.tenants (id uuid primary key, name text not null, synthetic boolean not null default true);\n";
sql +=
  "create table app.memberships (user_id text not null, tenant_id uuid not null references app.tenants(id), role text not null check(role in ('presenter','coordinator','planner','manager','steward','partner')), name text not null, active boolean not null default true, primary key(user_id,tenant_id));\n";
sql +=
  "create table app.demo_runs (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references app.tenants(id), business_at timestamptz not null, anchor_at timestamptz not null, status text not null check(status in ('active','ended')), revision int not null default 1, created_at timestamptz not null default now(), unique(id,tenant_id));\n";
sql +=
  "create unique index one_active_run on app.demo_runs(tenant_id) where status='active';\n";
for (const [name, [cols]] of Object.entries(definitions)) {
  sql +=
    "create table app." +
    name +
    " (id uuid primary key default gen_random_uuid(), tenant_id uuid not null references app.tenants(id), run_id uuid not null, " +
    cols +
    ", created_at timestamptz not null default now(), synthetic boolean not null default true, unique(id,tenant_id,run_id), foreign key(run_id,tenant_id) references app.demo_runs(id,tenant_id) on delete cascade);\n";
  sql +=
    "create index " + name + "_scope on app." + name + "(tenant_id,run_id);\n";
}
for (const [name, [, fks]] of Object.entries(definitions))
  for (const [col, parent] of Object.entries(fks || {})) {
    sql +=
      "alter table app." +
      name +
      " add constraint " +
      name +
      "_" +
      col +
      "_scope_fk foreign key(" +
      col +
      ",tenant_id,run_id) references app." +
      parent +
      "(id,tenant_id,run_id) deferrable initially deferred;\n";
    sql +=
      "create index " +
      name +
      "_" +
      col +
      "_idx on app." +
      name +
      "(" +
      col +
      ");\n";
  }
for (const name of ["demo_runs", ...Object.keys(definitions)]) {
  sql +=
    "alter table app." +
    name +
    " enable row level security;\nalter table app." +
    name +
    " force row level security;\n";
  sql +=
    "create policy tenant_scope on app." +
    name +
    " using(tenant_id::text=current_setting('app.tenant_id',true)) with check(tenant_id::text=current_setting('app.tenant_id',true));\n";
}
sql +=
  "alter table app.tenants enable row level security; create policy tenant_scope on app.tenants using(id::text=current_setting('app.tenant_id',true));\n";
sql +=
  "alter table app.memberships enable row level security; create policy member_scope on app.memberships using(user_id=current_setting('app.user_id',true));\n";
sql +=
  "create unique index shipment_reference on app.shipments(tenant_id,run_id,reference);\ncreate unique index command_dedupe on app.demo_commands(tenant_id,run_id,command_id);\ncreate unique index notification_dedupe on app.notifications(tenant_id,run_id,dedupe_key);\ncreate unique index domain_outbox_dedupe on app.domain_outbox(tenant_id,run_id,operation_key);\ncreate unique index scheduled_operation on app.scheduled_jobs(tenant_id,run_id,operation_key);\ncreate index cases_queue on app.exception_cases(tenant_id,run_id,state,due_at);\ncreate index milestone_timeline on app.milestone_events(shipment_id,observed_at desc);\ncreate index reference_search on app.external_references(tenant_id,run_id,value);\ncreate index due_business_jobs on app.scheduled_jobs(status,due_at);\n";
sql +=
  'create table app_auth."user" (id text primary key, name text not null, email text not null unique, "emailVerified" boolean not null default false, image text, "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now());\n';
sql +=
  'create table app_auth.session (id text primary key, "expiresAt" timestamptz not null, token text not null unique, "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now(), "ipAddress" text, "userAgent" text, "userId" text not null references app_auth."user"(id) on delete cascade);\n';
sql +=
  'create table app_auth.account (id text primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references app_auth."user"(id) on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, scope text, password text, "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now());\n';
sql +=
  'create table app_auth.verification (id text primary key, identifier text not null, value text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now());\n';
sql +=
  'create index auth_session_user on app_auth.session("userId"); create index auth_account_user on app_auth.account("userId"); create index auth_verification_identifier on app_auth.verification(identifier);\n';
sql += "revoke all on schema app,app_auth from public;\n";
writeFileSync(
  process.argv[2],
  "-- Generated from the reviewed relational definition; no demo credentials.\n" +
    sql,
);
console.log(
  Object.keys(definitions).length +
    " scoped business tables plus tenancy and auth tables.",
);
