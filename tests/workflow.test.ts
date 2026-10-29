import { beforeAll, afterAll, describe, it, expect } from "vitest";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { config } from "../packages/config";
import { pool, transaction, activeRun, one, rows } from "../packages/db";
import { seedRun } from "../packages/demo/seed";
import {
  demoCommand,
  caseDetail,
  proposeAction,
  executeAction,
  partnerReply,
  projectionFor,
} from "../packages/domain/service";
const admin = new pg.Pool({
  connectionString: config.adminDatabaseUrl,
  max: 2,
});
const tenantId = randomUUID();
let userId: string, runId: string, caseId: string;
const scope = { tenantId, userId: "", role: "presenter" };
beforeAll(async () => {
  const db = await admin.connect();
  try {
    userId = (
      await db.query('select id from app_auth."user" where email=$1', [
        "alex@baxter.example",
      ])
    ).rows[0].id;
    scope.userId = userId;
    await db.query("BEGIN");
    await db.query("insert into app.tenants(id,name) values($1,$2)", [
      tenantId,
      "Automated workflow validation",
    ]);
    const result = await seedRun(db, tenantId, userId);
    runId = result.runId;
    await db.query("COMMIT");
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}, 30000);
afterAll(async () => {
  await admin.query(
    "update app.demo_runs set status='ended' where tenant_id=$1",
    [tenantId],
  );
  await admin.end();
  await pool.end();
});
describe("database-backed response workflow", () => {
  it("seeds coherent counts, actual delivery evidence, complete forecasts, and tenant isolation", async () => {
    await transaction(scope, async (db) => {
      expect(
        Number((await one(db, "select count(*) from app.shipments")).count),
      ).toBe(500);
      expect(
        Number(
          (await one(db, "select count(*) from app.container_trips")).count,
        ),
      ).toBe(800);
      expect(
        Number(
          (await one(db, "select count(*) from app.demand_buckets")).count,
        ),
      ).toBe(38400);
      expect(
        Number(
          (
            await one(
              db,
              "select count(*) from app.shipments s join app.demo_runs r on r.id=s.run_id where s.status='delivered' and s.usable_eta>r.business_at",
            )
          ).count,
        ),
      ).toBe(0);
    });
    await transaction(
      { tenantId: randomUUID(), userId, role: "presenter" },
      async (db) =>
        expect(
          (
            await rows(db, "select * from app.shipments where run_id=$1", [
              runId,
            ])
          ).length,
        ).toBe(0),
    );
  });
  it("reconciles stock exposure and deduplicates repeat scenario clicks", async () => {
    await transaction(scope, async (db) => {
      const r = await demoCommand(db, scope, "S01", randomUUID(), runId);
      caseId = r.caseId;
      const c = await caseDetail(db, await activeRun(db, tenantId), caseId);
      expect(c.impact).toMatchObject({
        gapDays: 3,
        shortageUnits: 3000,
        orderExposure: 60000,
      });
      expect(Number(c.impact.donor.available)).toBe(3000);
      expect(
        (await demoCommand(db, scope, "S01", randomUUID(), runId)).caseId,
      ).toBe(caseId);
      expect(
        (
          await rows(db, "select * from app.notifications where case_id=$1", [
            caseId,
          ])
        ).length,
      ).toBe(1);
    });
  });
  it("requires the reviewed version and only records one execution for duplicate confirmations", async () => {
    const action = await transaction(scope, (db) =>
      proposeAction(db, scope, caseId, "followup", runId),
    );
    await expect(
      transaction(scope, (db) =>
        executeAction(db, scope, action.id, 99, runId),
      ),
    ).rejects.toThrow("changed");
    await transaction(scope, async (db) => {
      await executeAction(db, scope, action.id, action.version, runId);
      await executeAction(db, scope, action.id, action.version, runId);
      expect(
        (
          await rows(
            db,
            "select * from app.communications where action_id=$1",
            [action.id],
          )
        ).length,
      ).toBe(1);
      const job = await one(
        db,
        "select * from app.scheduled_jobs where action_id=$1",
        [action.id],
      );
      const run = await activeRun(db, tenantId);
      expect(
        new Date(job.due_at).getTime() - new Date(run.business_at).getTime(),
      ).toBe(7200000);
    });
  });
  it("records replies without claiming physical clearance or resolution", async () => {
    await transaction(scope, async (db) => {
      await partnerReply(db, scope, caseId, runId);
      const c = await caseDetail(db, await activeRun(db, tenantId), caseId);
      expect(c.case.state).not.toBe("resolved");
      expect(c.communications[0].extracted.clearanceConfirmed).toBe(false);
      expect(
        (
          await one(
            db,
            "select count(*) from app.scheduled_jobs where case_id=$1 and status='pending'",
            [caseId],
          )
        ).count,
      ).toBe("0");
    });
  });
  it("rejects planner approval, preserves donor protection, and requires a receipt to close", async () => {
    const action = await transaction(scope, (db) =>
      proposeAction(db, scope, caseId, "transfer", runId),
    );
    await expect(
      transaction({ ...scope, role: "planner" }, (db) =>
        executeAction(
          db,
          { ...scope, role: "planner" },
          action.id,
          action.version,
          runId,
        ),
      ),
    ).rejects.toThrow("manager");
    await transaction(scope, async (db) => {
      await executeAction(db, scope, action.id, action.version, runId);
      const c = await caseDetail(db, await activeRun(db, tenantId), caseId);
      expect(c.case.state).toBe("waiting");
      expect(c.impact.shortageUnits).toBe(0);
      expect(Number(c.impact.donor.available)).toBe(0);
      const r = await demoCommand(db, scope, "S09", randomUUID(), runId);
      expect(r.caseId).toBe(caseId);
      const resolved = await caseDetail(
        db,
        await activeRun(db, tenantId),
        caseId,
      );
      expect(resolved.case.state).toBe("resolved");
      expect(resolved.shipment.status).toBe("in_transit");
    });
  });
  it("calculates tiered charges and excludes cancelled ETA evidence", async () => {
    await transaction(scope, async (db) => {
      await demoCommand(db, scope, "S03", randomUUID(), runId);
      expect(
        Number(
          (
            await one(
              db,
              "select * from app.charge_calculations order by created_at desc limit 1",
            )
          ).amount,
        ),
      ).toBe(1300);
      const before = (
        await one(
          db,
          "select * from app.shipments where reference='DEMO-SHP-0101'",
        )
      ).usable_eta;
      await demoCommand(db, scope, "S06", randomUUID(), runId);
      const after = (
        await one(
          db,
          "select * from app.shipments where reference='DEMO-SHP-0101'",
        )
      ).usable_eta;
      expect(after).toEqual(before);
    });
  });
  it("reset creates a fresh scope and blocks previous-run decisions", async () => {
    const action = await transaction(scope, async (db) => {
      const other = await one(
        db,
        "select * from app.exception_cases where state<>'resolved' limit 1",
      );
      return proposeAction(db, scope, other.id, "followup", runId);
    });
    const next = await transaction(scope, (db) =>
      seedRun(db, tenantId, userId),
    );
    expect(next.runId).not.toBe(runId);
    await expect(
      transaction(scope, (db) =>
        executeAction(db, scope, action.id, action.version, runId),
      ),
    ).rejects.toThrow("ended");
  }, 30000);
});
