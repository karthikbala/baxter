import pg from "pg";
import { config, DEMO_TENANT, SECOND_TENANT } from "../packages/config";
import { seedRun } from "../packages/demo/seed";
process.env.SEED_AUTH = "true";
const { auth, authPool } = await import("../apps/api/auth");
const admin = new pg.Pool({
  connectionString: config.adminDatabaseUrl,
  max: 2,
});
const db = await admin.connect();
try {
  const email = "alex@baxter.example";
  let user = (
    await db.query('select id from app_auth."user" where email=$1', [email])
  ).rows[0];
  if (!user)
    user = (
      await auth.api.signUpEmail({
        body: { email, password: config.demoPassword, name: "Alex Morgan" },
      })
    ).user;
  let planner = (
    await db.query('select id from app_auth."user" where email=$1', [
      "eva@baxter.example",
    ])
  ).rows[0];
  if (!planner)
    planner = (
      await auth.api.signUpEmail({
        body: {
          email: "eva@baxter.example",
          password: config.demoPassword,
          name: "Eva Schmidt",
        },
      })
    ).user;
  await db.query("BEGIN");
  await db.query(
    "insert into app.tenants(id,name) values($1,'Baxter · EMEA Demo'),($2,'Isolated validation tenant') on conflict do nothing",
    [DEMO_TENANT, SECOND_TENANT],
  );
  await db.query(
    "insert into app.memberships(user_id,tenant_id,role,name) values($1,$2,'presenter','Alex Morgan') on conflict do nothing",
    [user.id, DEMO_TENANT],
  );
  await db.query(
    "insert into app.memberships(user_id,tenant_id,role,name) values($1,$2,'planner','Eva Schmidt') on conflict do nothing",
    [planner.id, DEMO_TENANT],
  );
  const result = await seedRun(db, DEMO_TENANT, user.id);
  await db.query("COMMIT");
  console.log(
    "Synthetic seed complete: 500 shipments, 800 container trips, 200 products, 35 initial cases.",
  );
  console.log(
    "Local demonstration access is available through the sign-in page.",
  );
} catch (e) {
  await db.query("ROLLBACK");
  throw e;
} finally {
  db.release();
  await admin.end();
  await authPool.end();
}
