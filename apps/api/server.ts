import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync, createReadStream } from "node:fs";
import { join, basename } from "node:path";
import ExcelJS from "exceljs";
import { config } from "../../packages/config";
import { auth, authPool } from "./auth";
import {
  pool,
  transaction,
  one,
  rows,
  insert,
  activeRun,
  type Scope,
} from "../../packages/db";
import {
  bootstrap,
  caseDetail,
  caseSelect,
  shipmentSelect,
  projectionFor,
  acknowledge,
  proposeAction,
  executeAction,
  demoCommand,
  partnerReply,
  runNetworkScenario,
  scoped,
  emit,
  audit,
  caseEvent,
  notify,
} from "../../packages/domain/service";
import { seedRun } from "../../packages/demo/seed";
import { assertCurrentRun, addDays } from "../../packages/domain/calculations";
import {
  assistantReply,
  voiceSession,
} from "../../packages/adapters/assistant";
import { seal } from "../../packages/adapters/credentials";
import { diagnosticError, diagnosticPath } from "../../packages/diagnostics";
import { createErrorLog } from "./diagnostics";
import { transcribeRecording } from "../../packages/adapters/transcription";
import { MAX_VOICE_BYTES, voiceLanguages, voiceMimeTypes } from "../../packages/voice";
const app = Fastify({
  genReqId: () => randomUUID(),
  logger: {
    level: process.env.LOG_LEVEL || "warn",
    redact: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
    ],
  },
  bodyLimit: 1048576,
});
const origins = [
  new URL(config.appUrl).origin,
  "https://localhost",
  "capacitor://localhost",
  ...(!config.production
    ? ["http://localhost:5180", "http://127.0.0.1:5180"]
    : []),
];
await app.register(cors, {
  origin: origins,
  credentials: true,
  exposedHeaders: ["set-auth-token", "x-request-id"],
});
await app.register(helmet, { contentSecurityPolicy: false });
await app.register(rateLimit, { max: 240, timeWindow: "1 minute" });
app.addContentTypeParser(voiceMimeTypes, { parseAs: "buffer", bodyLimit: MAX_VOICE_BYTES }, (_req, body, done) => done(null, body));
mkdirSync(config.fileRoot, { recursive: true, mode: 0o700 });
const recordError = createErrorLog(join(config.fileRoot, "diagnostics"), app.log);
app.addHook("onRequest", async (req, reply) => { reply.header("x-request-id", req.id); });
app.addHook("onResponse", async (req, reply) => {
  if (reply.statusCode >= 400 && req.routeOptions.url !== "/api/client-errors")
    recordError({ event: "api_failure", requestId: req.id, route: req.routeOptions.url || "unmatched",
      method: req.method, status: reply.statusCode, durationMs: Math.round(reply.elapsedTime) });
});
const scopeOf = (req: any): Scope => req.scope;
const idOf = (req: any) => z.string().uuid().parse(req.params.id);
const runBody = z.object({ runId: z.string().uuid() });
const requireRole = (scope: Scope, allowed: string[]) => {
  if (!allowed.includes(scope.role))
    throw Object.assign(new Error("Your role cannot perform this operation."), {
      statusCode: 403,
    });
};
app.setErrorHandler((error: any, request, reply) => {
  if (error instanceof z.ZodError)
    return reply
      .code(400)
      .send({
        error: "Invalid request",
        details: error.issues.map((x) => ({
          path: x.path,
          message: x.message,
        })),
      });
  const status = error.statusCode || 500;
  if (status >= 500)
    recordError({ event: "server_exception", requestId: request.id, route: request.routeOptions.url || "unmatched", ...diagnosticError(error) });
  reply
    .code(status)
    .send({
      error:
        status >= 500
          ? "The operation could not complete. Please retry or check service status."
          : error.message,
    });
});
app.addHook("onRequest", async (req, reply) => {
  if (!req.url.startsWith("/api/v1/") && req.url !== "/api/me") return;
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  if (!session) {
    await reply.code(401).send({ error: "Sign in to continue." });
    return;
  }
  const memberships = await transaction(
    { tenantId: "", userId: session.user.id, role: "unknown" },
    (db) =>
      rows(db, "select * from app.memberships where user_id=$1 and active", [
        session.user.id,
      ]),
  );
  const selected = req.headers["x-tenant-id"];
  const member = memberships.find((m) => !selected || m.tenant_id === selected);
  if (!member) {
    await reply
      .code(403)
      .send({ error: "No active membership for this workspace." });
    return;
  }
  (req as any).scope = {
    tenantId: member.tenant_id,
    userId: session.user.id,
    role: member.role,
  };
  (req as any).member = member;
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.cookie &&
    !req.headers.authorization &&
    (!req.headers.origin || !origins.includes(req.headers.origin))
  )
    await reply.code(403).send({ error: "Untrusted request origin." });
});
const sendAuth = async (response: Response, reply: any) => {
  for (const [key, value] of response.headers.entries())
    if (key !== "set-cookie") reply.header(key, value);
  const cookies = response.headers.getSetCookie();
  if (cookies.length) reply.header("set-cookie", cookies);
  reply.code(response.status);
  return reply.send(await response.text());
};
const clientErrorSchema = z.object({
  source: z.enum(["render", "window", "promise", "api"]),
  name: z.enum(["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "NetworkError", "AbortError"]),
  category: z.enum(["not_callable", "missing_value", "network", "unexpected"]),
  frames: z.array(z.string().max(240).regex(/^\/(?:assets\/[\w.-]+\.js|apps\/web\/src\/[\w./-]+\.[tj]sx?):\d+:\d+$/)).max(12),
  path: z.string().max(160), release: z.string().regex(/^1\.0\.\d{1,4}$/), clientTime: z.string().datetime(),
  requestId: z.string().uuid().optional(), status: z.number().int().min(400).max(599).optional(),
}).strict();
app.post("/api/client-errors", { bodyLimit: 8192, config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
  if (!req.headers.origin || !origins.includes(req.headers.origin)) return reply.code(403).send({ error: "Untrusted origin" });
  const event = clientErrorSchema.parse(req.body);
  recordError({ ...event, path: diagnosticPath(event.path), event: "client_error", ingestionRequestId: req.id });
  return reply.code(202).send({ received: true, requestId: req.id });
});
app.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  handler: async (req, reply) => {
    if (decodeURIComponent(req.url).includes("/sign-up"))
      return reply.code(403).send({ error: "Public signup is disabled." });
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers))
      if (value)
        headers.set(name, Array.isArray(value) ? value.join(",") : value);
    const response = await auth.handler(
      new Request(new URL(req.url, config.appUrl), {
        method: req.method,
        headers,
        body: req.method === "GET" ? undefined : JSON.stringify(req.body),
      }),
    );
    return sendAuth(response, reply);
  },
});
app.post(
  "/api/demo-login",
  { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
  async (req, reply) => {
    if (!config.demoAccess)
      return reply
        .code(403)
        .send({
          error:
            "Quick access is available only in the local development workspace.",
        });
    if (!req.headers.origin || !origins.includes(req.headers.origin))
      return reply.code(403).send({ error: "Untrusted origin." });
    const response = await auth.api.signInEmail({
      body: { email: "alex@baxter.example", password: config.demoPassword },
      asResponse: true,
    });
    return sendAuth(response, reply);
  },
);
app.get("/api/health", async () => {
  await pool.query("select 1");
  return { status: "ok", version: "0.1.0" };
});
app.get("/api/public-config", async () => ({
  demoAccess: config.demoAccess,
  appName: "Baxter Response",
}));
app.get("/api/me", async (req) => ({
  id: scopeOf(req).userId,
  name: (req as any).member.name,
  role: scopeOf(req).role,
  tenantId: scopeOf(req).tenantId,
}));
app.get("/api/v1/bootstrap", async (req) =>
  transaction(scopeOf(req), (db) => bootstrap(db, scopeOf(req))),
);
app.get("/api/v1/cases/:id", async (req) =>
  transaction(scopeOf(req), async (db) =>
    caseDetail(
      db,
      await activeRun(db, scopeOf(req).tenantId),
      idOf(req),
      scopeOf(req).role,
    ),
  ),
);
app.post("/api/v1/cases/:id/acknowledge", async (req) => {
  const b = runBody.parse(req.body);
  return transaction(scopeOf(req), (db) =>
    acknowledge(db, scopeOf(req), idOf(req), b.runId),
  );
});
app.post("/api/v1/cases/:id/actions", async (req) => {
  requireRole(scopeOf(req), ["presenter", "coordinator", "manager", "planner"]);
  const b = runBody
    .extend({
      kind: z.enum(["followup", "escalate", "assign", "transfer", "resolve"]),
      body: z.string().max(8000).optional(),
      reason: z.string().max(2000).optional(),
    })
    .parse(req.body);
  return transaction(scopeOf(req), (db) =>
    proposeAction(db, scopeOf(req), idOf(req), b.kind, b.runId, b),
  );
});
app.post("/api/v1/actions/:id/execute", async (req) => {
  requireRole(scopeOf(req), ["presenter", "manager", "planner", "coordinator"]);
  const b = runBody
    .extend({ version: z.number().int().positive() })
    .parse(req.body);
  return transaction(scopeOf(req), (db) =>
    executeAction(db, scopeOf(req), idOf(req), b.version, b.runId),
  );
});
app.get("/api/v1/shipments/:id", async (req) =>
  transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    const shipment = await one(
      db,
      shipmentSelect + " where s.id=$1 and s.run_id=$2",
      [idOf(req), run.id],
    );
    if (
      !shipment ||
      (scopeOf(req).role === "partner" && shipment.country !== "NL")
    )
      throw Object.assign(new Error("Shipment not found"), { statusCode: 404 });
    return {
      shipment,
      milestones: await rows(
        db,
        "select * from app.milestone_events where shipment_id=$1 order by observed_at desc",
        [shipment.id],
      ),
      containers: await rows(
        db,
        "select c.* from app.container_trips c join app.shipment_container_links l on l.container_id=c.id where l.shipment_id=$1",
        [shipment.id],
      ),
      references: await rows(
        db,
        "select * from app.external_references where shipment_id=$1",
        [shipment.id],
      ),
      lines: await rows(
        db,
        "select l.*,d.kind,d.reference from app.shipment_line_allocations a join app.business_document_lines l on l.id=a.line_id join app.business_documents d on d.id=l.document_id where a.shipment_id=$1",
        [shipment.id],
      ),
      cases: await rows(db, caseSelect + " where c.shipment_id=$1", [
        shipment.id,
      ]),
    };
  }),
);
app.get("/api/v1/customs", async (req) => {
  requireRole(scopeOf(req), [
    "presenter",
    "manager",
    "coordinator",
    "planner",
    "steward",
  ]);
  return transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    return {
      items: await rows(
        db,
        "select cc.*,s.reference,s.owner_name,l.city,l.country,p.name broker,(select jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'status',r.status)) from app.customs_requirements r where r.customs_id=cc.id) requirements from app.customs_cases cc join app.shipments s on s.id=cc.shipment_id join app.locations l on l.id=s.destination_id left join app.parties p on p.id=cc.broker_id where cc.run_id=$1 order by cc.free_until limit 80",
        [run.id],
      ),
      calculations: await rows(
        db,
        "select c.*,s.reference from app.charge_calculations c join app.shipments s on s.id=c.shipment_id where c.run_id=$1 order by c.created_at desc",
        [run.id],
      ),
      actuals: await rows(
        db,
        "select a.*,s.reference from app.actual_charges a join app.shipments s on s.id=a.shipment_id where a.run_id=$1",
        [run.id],
      ),
    };
  });
});
app.post("/api/v1/customs/:id/clear", async (req) => {
  requireRole(scopeOf(req), ["presenter"]);
  const b = runBody
    .extend({ evidence: z.string().min(15).max(2000) })
    .parse(req.body);
  return transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    assertCurrentRun(b.runId, run.id);
    const c = await one(
      db,
      "select * from app.customs_cases where id=$1 and run_id=$2",
      [idOf(req), run.id],
    );
    if (!c)
      throw Object.assign(new Error("Customs case not found"), {
        statusCode: 404,
      });
    await db.query(
      "update app.customs_cases set cleared_at=$2,status='cleared' where id=$1",
      [c.id, run.business_at],
    );
    await db.query(
      "update app.customs_requirements set status='received' where customs_id=$1",
      [c.id],
    );
    await insert(
      db,
      "milestone_events",
      scoped(run, {
        shipment_id: c.shipment_id,
        kind: "customs_cleared",
        qualifier: "actual",
        occurred_at: run.business_at,
        observed_at: run.business_at,
        detail: "Simulated clearance evidence: " + b.evidence,
      }),
    );
    const cases = await rows(
      db,
      "select * from app.exception_cases where shipment_id=$1 and kind='customs' and state<>'resolved'",
      [c.shipment_id],
    );
    for (const item of cases) {
      await db.query(
        "update app.exception_cases set state='resolved',resolved_at=now(),version=version+1 where id=$1",
        [item.id],
      );
      await caseEvent(
        db,
        run,
        item.id,
        "resolved",
        "Clearance evidence recorded",
        b.evidence,
        "Presenter simulation",
      );
    }
    await emit(db, run, "customs_updated", { shipmentId: c.shipment_id });
    return {
      message:
        "Customs clearance recorded. Final delivery remains a separate milestone.",
    };
  });
});
app.get("/api/v1/inventory", async (req) => {
  requireRole(scopeOf(req), ["presenter", "manager", "planner", "coordinator"]);
  return transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    const featured = await one(
      db,
      "select id from app.shipments where run_id=$1 and reference='DEMO-SHP-0101'",
      [run.id],
    );
    return {
      impact: await projectionFor(db, run, featured.id),
      positions: await rows(
        db,
        "select ip.*,p.code,p.name product,p.criticality,l.city,l.country from app.inventory_positions ip join app.products p on p.id=ip.product_id join app.locations l on l.id=ip.site_id where ip.run_id=$1 order by p.code,l.city limit 640",
        [run.id],
      ),
      inbound: await rows(
        db,
        "select ip.*,p.name product,l.city from app.inbound_plans ip join app.products p on p.id=ip.product_id join app.locations l on l.id=ip.destination_id where ip.run_id=$1",
        [run.id],
      ),
    };
  });
});
app.get("/api/v1/network", async (req) => {
  requireRole(scopeOf(req), ["presenter", "manager", "planner"]);
  return transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    return {
      products: await rows(
        db,
        "select * from app.products where run_id=$1 order by code",
        [run.id],
      ),
      components: await rows(
        db,
        "select c.*,b.product_id parent_id from app.bom_components c join app.bom_versions b on b.id=c.bom_id where c.run_id=$1 and b.active",
        [run.id],
      ),
      sources: await rows(
        db,
        "select s.*,p.name supplier from app.sourcing_options s join app.parties p on p.id=s.supplier_id where s.run_id=$1",
        [run.id],
      ),
      scenarios: await rows(
        db,
        "select s.*,r.result from app.network_scenarios s join app.scenario_results r on r.scenario_id=s.id where s.run_id=$1 order by s.created_at desc",
        [run.id],
      ),
    };
  });
});
app.post("/api/v1/network-scenarios", async (req) => {
  requireRole(scopeOf(req), ["presenter", "manager", "planner"]);
  const b = runBody
    .extend({
      kind: z.enum(["supplier", "route", "tariff"]),
      days: z.number().min(1).max(30),
      tariff: z.number().min(0).max(50),
      country: z.string().length(2),
      supplierId: z.string().uuid().optional(),
    })
    .parse(req.body);
  return transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    assertCurrentRun(b.runId, run.id);
    return runNetworkScenario(db, run, scopeOf(req), b.kind, b);
  });
});
app.get("/api/v1/partners", async (req) => {
  requireRole(scopeOf(req), ["presenter", "manager", "coordinator"]);
  return transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    return rows(
      db,
      "select p.id,p.name,count(s.id)::int shipments,count(*) filter(where s.status='delivered')::int delivered,round(avg(greatest(0,extract(epoch from(s.usable_eta-s.baseline_eta))/86400))::numeric,1) avg_delay_days,(select count(*)::int from app.exception_cases c join app.shipments sh on sh.id=c.shipment_id where sh.provider_id=p.id and c.state<>'resolved') open_cases,(select count(*)::int from app.communications cm join app.exception_cases c on c.id=cm.case_id join app.shipments sh on sh.id=c.shipment_id where sh.provider_id=p.id and cm.direction='inbound') replies from app.parties p join app.shipments s on s.provider_id=p.id where p.run_id=$1 group by p.id,p.name order by shipments desc,p.name",
      [run.id],
    );
  });
});
app.get("/api/v1/data-quality", async (req) => {
  requireRole(scopeOf(req), ["presenter", "manager", "steward"]);
  return transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    return {
      issues: await rows(
        db,
        "select q.*,s.reference from app.data_quality_issues q left join app.shipments s on s.id=q.shipment_id where q.run_id=$1 order by q.created_at desc",
        [run.id],
      ),
      matches: await rows(
        db,
        "select m.*,r.value,r.kind,s.reference from app.reference_matches m join app.external_references r on r.id=m.reference_id left join app.shipments s on s.id=m.candidate_shipment_id where m.run_id=$1",
        [run.id],
      ),
      connections: await rows(
        db,
        "select * from app.integration_connections where run_id=$1",
        [run.id],
      ),
    };
  });
});
app.post("/api/v1/data-quality/:id/resolve", async (req) => {
  requireRole(scopeOf(req), ["presenter", "steward"]);
  const b = runBody
    .extend({
      resolution: z.string().min(15).max(2000),
      matchId: z.string().uuid().optional(),
    })
    .parse(req.body);
  return transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    assertCurrentRun(b.runId, run.id);
    const issue = await one(
      db,
      "select * from app.data_quality_issues where id=$1 and run_id=$2",
      [idOf(req), run.id],
    );
    if (!issue)
      throw Object.assign(new Error("Issue not found"), { statusCode: 404 });
    if (issue.kind === "ambiguous_reference") {
      if (!b.matchId)
        throw Object.assign(new Error("Select a validated candidate."), {
          statusCode: 400,
        });
      const match = await one(
        db,
        "select * from app.reference_matches where id=$1 and reference_id=$2 and run_id=$3",
        [b.matchId, issue.reference_id, run.id],
      );
      if (!match)
        throw Object.assign(new Error("Invalid candidate"), {
          statusCode: 400,
        });
      await db.query(
        "update app.external_references set shipment_id=$2,verified=true where id=$1",
        [issue.reference_id, match.candidate_shipment_id],
      );
      await db.query(
        "update app.reference_matches set status=case when id=$2 then 'validated' else 'rejected' end,reviewed_by=$3 where reference_id=$1",
        [issue.reference_id, b.matchId, scopeOf(req).userId],
      );
    }
    await db.query(
      "update app.data_quality_issues set status='resolved',resolution=$2,resolved_by=$3 where id=$1",
      [issue.id, b.resolution, scopeOf(req).userId],
    );
    await audit(db, run, scopeOf(req).userId, "data_issue.resolved", issue.id);
    await emit(db, run, "data_updated", {});
    return { message: "Evidence review recorded." };
  });
});
app.post("/api/v1/demo/trigger", async (req) => {
  requireRole(scopeOf(req), ["presenter"]);
  const b = runBody
    .extend({
      scenario: z.enum([
        "S01",
        "S02",
        "S03",
        "S04",
        "S05",
        "S06",
        "S07",
        "S08",
        "S09",
      ]),
      commandId: z.string().uuid(),
      caseId: z.string().uuid().optional(),
    })
    .parse(req.body);
  return transaction(scopeOf(req), (db) =>
    demoCommand(db, scopeOf(req), b.scenario, b.commandId, b.runId, b.caseId),
  );
});
app.post("/api/v1/demo/notify", async (req) => {
  requireRole(scopeOf(req), ["presenter"]);
  const b = runBody
    .extend({ caseId: z.string().uuid(), commandId: z.string().uuid() })
    .parse(req.body);
  return transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    assertCurrentRun(b.runId, run.id);
    const c = (await caseDetail(db, run, b.caseId)).case;
    const existing = await one(
      db,
      "select id from app.notifications where run_id=$1 and dedupe_key=$2",
      [run.id, b.commandId],
    );
    if (!existing) await notify(db, run, c, b.commandId);
    return {
      caseId: c.id,
      message:
        "Critical case notification queued again for the enrolled owner device.",
    };
  });
});
app.post("/api/v1/demo/reset", async (req) => {
  requireRole(scopeOf(req), ["presenter"]);
  const b = runBody.parse(req.body);
  return transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    assertCurrentRun(b.runId, run.id);
    await db.query("select pg_advisory_xact_lock(hashtext($1))", [run.id]);
    return seedRun(db, scopeOf(req).tenantId, scopeOf(req).userId);
  });
});
app.post("/api/v1/demo/reply", async (req) => {
  requireRole(scopeOf(req), ["presenter"]);
  const b = runBody.extend({ caseId: z.string().uuid() }).parse(req.body);
  return transaction(scopeOf(req), (db) =>
    partnerReply(db, scopeOf(req), b.caseId, b.runId),
  );
});
app.post("/api/v1/demo/advance", async (req) => {
  requireRole(scopeOf(req), ["presenter"]);
  const b = runBody
    .extend({ hours: z.number().positive().max(168) })
    .parse(req.body);
  return transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    assertCurrentRun(b.runId, run.id);
    await db.query(
      "update app.demo_runs set business_at=business_at+($2*interval '1 hour') where id=$1",
      [run.id, b.hours],
    );
    await emit(db, run, "clock_advanced", { hours: b.hours });
    return {
      message:
        "Business clock advanced. Due actions will be processed by the worker.",
    };
  });
});
app.get("/api/v1/demo/status", async (req) => {
  requireRole(scopeOf(req), ["presenter"]);
  return transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    return {
      run,
      commands: await rows(
        db,
        "select * from app.demo_commands where run_id=$1 order by created_at desc",
        [run.id],
      ),
      notifications: await rows(
        db,
        "select n.*,coalesce((select jsonb_agg(jsonb_build_object('status',a.status,'provider',a.provider,'error',a.error_code,'at',a.created_at)) from app.notification_attempts a where a.notification_id=n.id),'[]') attempts,coalesce((select jsonb_agg(jsonb_build_object('kind',e.kind,'at',e.created_at)) from app.notification_events e where e.notification_id=n.id),'[]') events from app.notifications n where n.run_id=$1 order by n.created_at desc limit 30",
        [run.id],
      ),
      jobs: await rows(
        db,
        "select kind,status,due_at,clock_domain from app.scheduled_jobs where run_id=$1 order by created_at desc limit 20",
        [run.id],
      ),
      capabilities: {
        worker: !!(await one(
          db,
          "select 1 from app.service_heartbeats where service='worker' and last_seen_at>now()-interval '15 seconds'",
        )),
        openai: !!config.openaiKey,
        webPush: !!config.vapidPrivate,
        nativePush: !!config.fcmCredentials,
        delivery: "simulated business events, real configured device pushes",
        hosting: config.production ? "server deployment" : "local development",
      },
    };
  });
});
app.get("/api/v1/assistant/:id/history", async (req) =>
  transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    await caseDetail(db, run, idOf(req), scopeOf(req).role);
    const messages = await rows(
      db,
      "select m.* from app.assistant_messages m join app.assistant_threads t on t.id=m.thread_id where t.case_id=$1 and t.user_id=$2 and t.run_id=$3 order by m.created_at",
      [idOf(req), scopeOf(req).userId, run.id],
    );
    for (const m of messages) {
      m.text = m.content;
      m.mode = m.model === "template" ? "template" : "live";
      m.cards = await rows(
        db,
        "select * from app.actions where id=any($1::uuid[]) and run_id=$2",
        [(m.cards || []).map((c: any) => c.actionId), run.id],
      );
    }
    return messages;
  }),
);
app.post(
  "/api/v1/assistant",
  { config: { rateLimit: { max: 15, timeWindow: "1 minute" } } },
  async (req) => {
    requireRole(scopeOf(req), [
      "presenter",
      "manager",
      "coordinator",
      "planner",
    ]);
    const b = runBody
      .extend({
        caseId: z.string().uuid(),
        message: z.string().min(1).max(4000),
      })
      .parse(req.body);
    return assistantReply(scopeOf(req), b.caseId, b.message, b.runId);
  },
);
app.post(
  "/api/v1/voice/session",
  { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
  async (req) => {
    const b = runBody.parse(req.body);
    await transaction(scopeOf(req), async (db) =>
      assertCurrentRun(
        b.runId,
        (await activeRun(db, scopeOf(req).tenantId)).id,
      ),
    );
    return voiceSession();
  },
);
app.post("/api/v1/voice/transcribe", {
  bodyLimit: MAX_VOICE_BYTES,
  config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
}, async (req, reply) => {
  requireRole(scopeOf(req), ["presenter", "manager", "coordinator", "planner"]);
  const query = runBody.extend({ caseId: z.string().uuid(), language: z.enum(voiceLanguages).default("auto") }).parse(req.query);
  if (!Buffer.isBuffer(req.body)) throw Object.assign(new Error("Send an audio recording."), { statusCode: 400 });
  const terms = await transaction(scopeOf(req), async db => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    assertCurrentRun(query.runId, run.id);
    const detail = await caseDetail(db, run, query.caseId, scopeOf(req).role);
    return [detail.shipment?.reference, detail.shipment?.product_name, detail.shipment?.product_code,
      detail.shipment?.origin_city, detail.shipment?.city, detail.shipment?.provider];
  });
  const cancellation = new AbortController();
  const disconnect = () => { if (!reply.raw.writableEnded) cancellation.abort(); };
  reply.raw.on("close", disconnect);
  try {
    // Do not hold the database/tenant lock during a provider call, or store the audio.
    const result = await transcribeRecording(req.body, req.headers["content-type"] || "", query.language, terms, cancellation.signal);
    await transaction(scopeOf(req), async db => assertCurrentRun(query.runId, (await activeRun(db, scopeOf(req).tenantId)).id));
    reply.header("Cache-Control", "no-store");
    return result;
  } finally { reply.raw.off("close", disconnect); }
});
app.get("/api/v1/devices", async (req) =>
  transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    return {
      publicKey: config.vapidPublic,
      devices: await rows(
        db,
        "select id,label,platform,channel,active,last_seen_at from app.devices where run_id=$1 and user_id=$2 order by created_at desc",
        [run.id, scopeOf(req).userId],
      ),
      nativeConfigured: !!config.fcmCredentials,
    };
  }),
);
app.post("/api/v1/devices", async (req) => {
  const b = runBody
    .extend({
      label: z.string().min(1).max(100),
      platform: z.string().max(30),
      channel: z.enum(["web", "native"]),
      credential: z.any(),
    })
    .parse(req.body);
  if (b.channel === "web") {
    const host = new URL(b.credential?.endpoint || "https://invalid").hostname;
    if (
      ![
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
        "wns.windows.com",
      ].some((h) => host === h || host.endsWith("." + h))
    )
      throw Object.assign(new Error("Unsupported push provider endpoint"), {
        statusCode: 400,
      });
    z.object({
      endpoint: z.string().url().startsWith("https://"),
      keys: z.object({ p256dh: z.string(), auth: z.string() }),
    }).parse(b.credential);
  } else z.object({ token: z.string().min(20).max(1000) }).parse(b.credential);
  return transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    assertCurrentRun(b.runId, run.id);
    await db.query(
      "update app.devices set active=false where run_id=$1 and user_id=$2 and label=$3",
      [run.id, scopeOf(req).userId, b.label],
    );
    const d = await insert(
      db,
      "devices",
      scoped(run, {
        user_id: scopeOf(req).userId,
        label: b.label,
        platform: b.platform,
        channel: b.channel,
        credential: JSON.stringify(seal(b.credential)),
        last_seen_at: new Date().toISOString(),
      }),
    );
    return { id: d.id, label: d.label, channel: d.channel };
  });
});
app.post("/api/v1/devices/test", async (req) => {
  const b = runBody.parse(req.body);
  return transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    assertCurrentRun(b.runId, run.id);
    const n = await insert(
      db,
      "notifications",
      scoped(run, {
        user_id: scopeOf(req).userId,
        title: "Baxter Response · connection test",
        body: "Your demonstration notification channel is connected.",
        severity: "critical",
        status: "queued",
        dedupe_key: randomUUID(),
        expires_at: new Date(Date.now() + 300000).toISOString(),
        link: "/profile?run=" + run.id,
      }),
    );
    await emit(db, run, "notification", { notificationId: n.id });
    return {
      id: n.id,
      message: "Test push queued. Check the delivery log and the actual phone.",
    };
  });
});
app.post("/api/v1/notifications/:id/events", async (req) => {
  const b = runBody
    .extend({
      kind: z.enum(["received", "displayed", "opened"]),
      deviceId: z.string().uuid().optional(),
    })
    .parse(req.body);
  return transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    assertCurrentRun(b.runId, run.id);
    const n = await one(
      db,
      "select id from app.notifications where id=$1 and run_id=$2 and user_id=$3",
      [idOf(req), run.id, scopeOf(req).userId],
    );
    if (!n)
      throw Object.assign(new Error("Notification not found"), {
        statusCode: 404,
      });
    await insert(
      db,
      "notification_events",
      scoped(run, {
        notification_id: n.id,
        device_id: b.deviceId,
        kind: b.kind,
        provenance: "authenticated client report",
      }),
    );
    return { ok: true };
  });
});
app.post("/api/v1/exports", async (req) => {
  const b = runBody
    .extend({
      format: z.enum(["csv", "xlsx"]),
      kind: z.enum(["shipments", "cases"]),
      search: z.string().max(200).optional(),
      country: z.string().optional(),
      state: z.string().optional(),
    })
    .parse(req.body);
  const data = await transaction(scopeOf(req), async (db) => {
    const run = await activeRun(db, scopeOf(req).tenantId);
    assertCurrentRun(b.runId, run.id);
    const all = await bootstrap(db, scopeOf(req));
    let items = b.kind === "shipments" ? all.shipments : all.cases;
    items = items.filter(
      (x) =>
        (!b.search ||
          JSON.stringify([x.reference, x.title, x.city, x.provider])
            .toLowerCase()
            .includes(b.search.toLowerCase())) &&
        (!b.country || x.country === b.country) &&
        (!b.state || x.state === b.state || x.status === b.state),
    );
    const records = items.map((x) => ({
      Reference: x.reference,
      Shipment: x.shipment_reference || x.reference,
      Issue: x.title || "",
      Destination: x.city,
      Country: x.country,
      Provider: x.provider,
      State: x.state || x.status,
      Owner: x.owner_name,
      "Usable ETA": x.usable_eta ? new Date(x.usable_eta).toISOString() : "",
      "Order exposure EUR": x.exposure ?? "",
      Synthetic: "DEMO DATA",
      "Business time UTC": new Date(run.business_at).toISOString(),
      "Generated UTC": new Date().toISOString(),
    }));
    const job = await insert(
      db,
      "export_jobs",
      scoped(run, {
        user_id: scopeOf(req).userId,
        kind: b.kind,
        format: b.format,
        filters: JSON.stringify(b),
        status: "processing",
      }),
    );
    return { run, job, records };
  });
  const key = data.job.id + "." + b.format;
  const file = join(config.fileRoot, key);
  const safe = (x: any) => {
    const s = String(x ?? "");
    return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  };
  if (b.format === "csv") {
    const headers = Object.keys(
      data.records[0] || { Reference: "", Synthetic: "" },
    );
    const quote = (v: any) => '"' + safe(v).replaceAll('"', '""') + '"';
    writeFileSync(
      file,
      "\ufeff" +
        [
          headers.map(quote).join(","),
          ...data.records.map((r) =>
            headers.map((h) => quote((r as any)[h])).join(","),
          ),
        ].join("\r\n"),
    );
  } else {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Demo " + b.kind);
    const headers = Object.keys(
      data.records[0] || { Reference: "", Synthetic: "" },
    );
    sheet.columns = headers.map((key) => ({ header: key, key, width: 24 }));
    for (const row of data.records) sheet.addRow(row);
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF123D48" },
    };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    await workbook.xlsx.writeFile(file);
  }
  await transaction(scopeOf(req), (db) =>
    db.query(
      "update app.export_jobs set status='ready',file_key=$2,row_count=$3 where id=$1",
      [data.job.id, key, data.records.length],
    ),
  );
  return {
    id: data.job.id,
    rows: data.records.length,
    url: "/api/v1/exports/" + data.job.id + "/download",
  };
});
app.get("/api/v1/exports/:id/download", async (req, reply) => {
  const job = await transaction(scopeOf(req), (db) =>
    one(
      db,
      "select * from app.export_jobs where id=$1 and user_id=$2 and status='ready'",
      [idOf(req), scopeOf(req).userId],
    ),
  );
  if (!job) return reply.code(404).send({ error: "Export not found" });
  reply
    .header(
      "Content-Disposition",
      'attachment; filename="baxter-demo-' + job.kind + "." + job.format + '"',
    )
    .type(
      job.format === "csv"
        ? "text/csv; charset=utf-8"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
  return reply.send(
    createReadStream(join(config.fileRoot, basename(job.file_key))),
  );
});
app.get("/api/v1/events", async (req, reply) => {
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  let last = "",
    busy = false,
    closed = false;
  const scope = scopeOf(req);
  const began = Date.now();
  const tick = async () => {
    if (busy || closed) return;
    busy = true;
    try {
      if (
        Date.now() - began > 300000 ||
        !(await auth.api.getSession({ headers: fromNodeHeaders(req.headers) }))
      ) {
        closed = true;
        reply.raw.end();
        return;
      }
      const stamp = await transaction(scope, async (db) => {
        const run = await activeRun(db, scope.tenantId);
        const r = await one(
          db,
          "select max(created_at)::text stamp from app.domain_outbox where run_id=$1",
          [run.id],
        );
        return run.id + ":" + (r.stamp || "");
      });
      if (stamp !== last) {
        last = stamp;
        reply.raw.write(
          "event: change\ndata: " + JSON.stringify({ refresh: true }) + "\n\n",
        );
      } else reply.raw.write(": heartbeat\n\n");
    } catch {
      reply.raw.write("event: reconnect\ndata: {}\n\n");
    } finally {
      busy = false;
    }
  };
  await tick();
  const timer = setInterval(tick, 3000);
  reply.raw.on("close", () => {
    closed = true;
    clearInterval(timer);
  });
});
await app.listen({ host: config.host, port: config.port });
console.log("Baxter API ready on " + config.host + ":" + config.port);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, async () => {
    await app.close();
    await pool.end();
    await authPool.end();
    process.exit(0);
  });
