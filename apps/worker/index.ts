import { PgBoss } from "pg-boss";
import { config, DEMO_TENANT } from "../../packages/config";
import { transaction, rows, one, pool } from "../../packages/db";
import { deliverNotification } from "../../packages/adapters/notifications";
import { caseEvent, notify } from "../../packages/domain/service";
const boss = new PgBoss({
  connectionString: config.queueDatabaseUrl,
  schema: "pgboss",
  migrate: false,
});
boss.on("error", (error) => console.error("Worker queue error:", error.name));
await boss.start();
await boss.work(
  "notification",
  { batchSize: 4, localConcurrency: 2 },
  async (jobs) => {
    for (const job of jobs) await deliverNotification(job.data as any);
  },
);
let running = false;
const tenants = (process.env.WORKER_TENANT_IDS || DEMO_TENANT).split(",");
const tick = async () => {
  if (running) return;
  running = true;
  try {
    for (const tenantId of tenants)
      await transaction(
        { tenantId, userId: "worker", role: "system" },
        async (db) => {
          await db.query(
            "insert into app.service_heartbeats(tenant_id,service) values($1,'worker') on conflict(tenant_id,service) do update set last_seen_at=now()",
            [tenantId],
          );
          const events = await rows(
            db,
            "select o.* from app.domain_outbox o join app.demo_runs r on r.id=o.run_id where r.status='active' and o.status='pending' order by o.created_at limit 30 for update of o skip locked",
          );
          for (const e of events) {
            if (e.event_type === "notification")
              await boss.send(
                "notification",
                {
                  tenantId,
                  runId: e.run_id,
                  notificationId: e.payload.notificationId,
                },
                {
                  singletonKey: e.payload.notificationId,
                  singletonSeconds: 300,
                  retryLimit: 3,
                  retryDelay: 5,
                  retryBackoff: true,
                },
              );
            await db.query(
              "update app.domain_outbox set status='processed',processed_at=now() where id=$1",
              [e.id],
            );
          }
          const due = await rows(
            db,
            "select j.* from app.scheduled_jobs j join app.demo_runs r on r.id=j.run_id where r.status='active' and j.status='pending' and ((j.clock_domain='business' and j.due_at<=r.business_at) or(j.clock_domain='wall' and j.due_at<=now())) limit 20 for update of j skip locked",
          );
          for (const j of due) {
            const run = await one(
              db,
              "select * from app.demo_runs where id=$1",
              [j.run_id],
            );
            const c = await one(
              db,
              "select * from app.exception_cases where id=$1",
              [j.case_id],
            );
            if (c && c.state !== "resolved") {
              await db.query(
                "update app.exception_cases set state='escalated',severity='critical',version=version+1 where id=$1",
                [c.id],
              );
              await caseEvent(
                db,
                run,
                c.id,
                "escalated",
                "Follow-up deadline exceeded",
                "No partner reply was recorded before the configured business deadline.",
              );
              await notify(
                db,
                run,
                { ...c, severity: "critical" },
                "due:" + j.id,
              );
            }
            await db.query(
              "update app.scheduled_jobs set status='fired' where id=$1",
              [j.id],
            );
          }
        },
      );
  } catch (e: any) {
    console.error("Worker tick failed:", e.code || e.name);
  } finally {
    running = false;
  }
};
await tick();
const timer = setInterval(tick, 1500);
console.log(
  "Baxter worker ready: durable notifications and escalation timers.",
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    clearInterval(timer);
    await boss.stop();
    await pool.end();
    process.exit(0);
  });
