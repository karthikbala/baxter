create table app.service_heartbeats (
  tenant_id uuid not null references app.tenants(id),
  service text not null,
  last_seen_at timestamptz not null default now(),
  primary key(tenant_id,service)
);
alter table app.service_heartbeats enable row level security;
alter table app.service_heartbeats force row level security;
create policy tenant_scope on app.service_heartbeats using(tenant_id::text=current_setting('app.tenant_id',true)) with check(tenant_id::text=current_setting('app.tenant_id',true));
