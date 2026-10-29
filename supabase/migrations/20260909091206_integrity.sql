drop policy member_scope on app.memberships;
create policy member_scope on app.memberships for select using(user_id=current_setting('app.user_id',true) or tenant_id::text=current_setting('app.tenant_id',true));
create unique index one_open_issue on app.exception_cases(tenant_id,run_id,shipment_id,kind) where state <> 'resolved';
create unique index scenario_once on app.demo_commands(tenant_id,run_id,scenario);
