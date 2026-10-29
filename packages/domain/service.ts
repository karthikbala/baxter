import { randomUUID, createHash } from "node:crypto";
import type { Db, Scope } from "../db";
import { activeRun, insert, one, rows } from "../db";
import {
  addDays,
  stockProjection,
  chargeEstimate,
  allocateExposure,
  assertCurrentRun,
} from "./calculations";
import { seedRun } from "../demo/seed";

export const caseSelect =
  "select c.*, s.reference shipment_reference, s.provider_id, s.product_id, s.destination_id, d.city, d.country, p.name provider from app.exception_cases c left join app.shipments s on s.id=c.shipment_id left join app.locations d on d.id=s.destination_id left join app.parties p on p.id=s.provider_id";
export const shipmentSelect =
  "select s.*,o.city origin_city,o.country origin_country,o.lat origin_lat,o.lon origin_lon,d.city,d.country,d.lat,d.lon,p.name provider,pr.name product_name,pr.code product_code,extract(epoch from(s.usable_eta-s.baseline_eta))/86400 delay_days from app.shipments s join app.locations o on o.id=s.origin_id join app.locations d on d.id=s.destination_id join app.parties p on p.id=s.provider_id join app.products pr on pr.id=s.product_id";
export function scoped(run: any, data: Record<string, unknown>) {
  return { tenant_id: run.tenant_id, run_id: run.id, ...data };
}
export async function audit(
  db: Db,
  run: any,
  actor: string,
  operation: string,
  entityId: string | null,
  metadata: unknown = {},
) {
  return insert(
    db,
    "audit_events",
    scoped(run, {
      actor,
      operation,
      entity_id: entityId,
      metadata: JSON.stringify(metadata),
    }),
  );
}
export async function caseEvent(
  db: Db,
  run: any,
  caseId: string,
  kind: string,
  title: string,
  detail: string,
  actor = "Response engine",
  payload: unknown = {},
) {
  return insert(
    db,
    "case_events",
    scoped(run, {
      case_id: caseId,
      kind,
      actor,
      title,
      detail,
      payload: JSON.stringify(payload),
      business_at: run.business_at,
    }),
  );
}
export async function emit(
  db: Db,
  run: any,
  type: string,
  payload: unknown,
  key: string = randomUUID(),
) {
  return insert(
    db,
    "domain_outbox",
    scoped(run, {
      event_type: type,
      payload: JSON.stringify(payload),
      operation_key: key,
    }),
  );
}
export async function getCase(db: Db, run: any, id: string, role?: string) {
  const c = await one(db, caseSelect + " where c.id=$1 and c.run_id=$2", [
    id,
    run.id,
  ]);
  if (!c || (role === "partner" && c.country !== "NL"))
    throw Object.assign(
      new Error("Case not found in your current workspace."),
      { statusCode: 404 },
    );
  return c;
}
export async function notify(db: Db, run: any, c: any, key: string) {
  const n = await insert(
    db,
    "notifications",
    scoped(run, {
      case_id: c.id,
      user_id: c.owner_user_id,
      title: c.severity === "critical" ? "Critical · action required" : c.title,
      body: c.title + " · " + (c.city || "EMEA"),
      severity: c.severity,
      status: "queued",
      dedupe_key: key,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      link: "/cases/" + c.id + "?run=" + run.id,
    }),
  );
  await emit(
    db,
    run,
    "notification",
    { notificationId: n.id },
    "notify:" + n.id,
  );
  return n;
}
export async function ensureCase(
  db: Db,
  run: any,
  scope: Scope,
  shipment: any,
  kind: string,
  title: string,
  summary: string,
  severity = "high",
) {
  let c = await one(
    db,
    "select * from app.exception_cases where shipment_id=$1 and run_id=$2 and kind=$3 and state<>'resolved'",
    [shipment.id, run.id, kind],
  );
  if (c) return c;
  const count = await one(
    db,
    "select count(*)::int n from app.exception_cases where run_id=$1",
    [run.id],
  );
  c = await insert(
    db,
    "exception_cases",
    scoped(run, {
      reference: "CASE-" + (1100 + count.n),
      shipment_id: shipment.id,
      kind,
      title,
      summary,
      severity,
      state: "new",
      owner_name: "Alex Morgan",
      owner_user_id: scope.userId,
      due_at: addDays(run.business_at, 0.25),
      next_action: "Review recovery options",
    }),
  );
  await insert(
    db,
    "case_entities",
    scoped(run, {
      case_id: c.id,
      entity_type: "shipment",
      entity_id: shipment.id,
    }),
  );
  await caseEvent(db, run, c.id, "detected", "Exception detected", summary);
  return c;
}
export async function projectionFor(db: Db, run: any, shipmentId: string) {
  const s = await one(db, shipmentSelect + " where s.id=$1 and s.run_id=$2", [
    shipmentId,
    run.id,
  ]);
  if (!s)
    throw Object.assign(new Error("Shipment not found"), { statusCode: 404 });
  const position = await one(
    db,
    "select coalesce(sum(quantity-reserved),0) quantity from app.inventory_positions where run_id=$1 and site_id=$2 and product_id=$3 and status='released' and as_of<=$4",
    [run.id, s.destination_id, s.product_id, run.anchor_at],
  );
  const demand = await rows(
    db,
    "select date,quantity from app.demand_buckets where run_id=$1 and site_id=$2 and product_id=$3 and date >= $4::date order by date limit 12",
    [run.id, s.destination_id, s.product_id, run.anchor_at],
  );
  if (demand.length !== 12)
    return {
      available: false,
      reason:
        "Complete demand coverage is not available for this product and site.",
      shipment: s,
    };
  const inbound = await rows(
    db,
    "select * from app.inbound_plans where run_id=$1 and destination_id=$2 and product_id=$3 and status in ('planned','received')",
    [run.id, s.destination_id, s.product_id],
  );
  const receipts = inbound.map((x) => ({
    day: Math.round(
      (new Date(x.usable_at).getTime() - new Date(run.anchor_at).getTime()) /
        86400000,
    ),
    quantity: Number(x.quantity),
    source: x.kind,
  }));
  const projection = stockProjection(
    Number(position.quantity),
    demand.map((d) => Number(d.quantity)),
    receipts,
  );
  const shortageUnits = projection.reduce((n, p) => n + p.unmet, 0),
    gapDays = projection.filter((p) => p.unmet > 0).length;
  const orderLines = await rows(
    db,
    "select l.id,l.quantity,l.unit_price,l.required_at from app.document_line_links dl join app.business_document_lines l on l.id=dl.target_id join app.shipment_line_allocations a on a.line_id=dl.source_id where a.shipment_id=$1",
    [s.id],
  );
  const affected = orderLines.filter((l) => {
    const day = Math.floor(
      (new Date(l.required_at).getTime() - new Date(run.anchor_at).getTime()) /
        86400000,
    );
    return projection[day]?.unmet > 0;
  });
  const exposure = allocateExposure(
    affected.map((l) => ({
      lineId: l.id,
      allocated: Number(l.quantity),
      ordered: Number(l.quantity),
      unitPrice: Number(l.unit_price),
    })),
  );
  const donor = await one(
    db,
    "select ip.*,l.name,l.city,(ip.quantity-ip.reserved-coalesce((select sum(r.quantity) from app.inventory_reservations r where r.site_id=ip.site_id and r.product_id=ip.product_id and r.run_id=ip.run_id and r.kind='protection requirement'),0)) available from app.inventory_positions ip join app.locations l on l.id=ip.site_id where ip.run_id=$1 and ip.product_id=$2 and ip.site_id<>$3 and ip.status='released' order by l.city desc",
    [run.id, s.product_id, s.destination_id],
  );
  const exactDonor = await one(
    db,
    "select ip.*,l.name,l.city,(ip.quantity-ip.reserved-coalesce((select sum(r.quantity) from app.inventory_reservations r where r.site_id=ip.site_id and r.product_id=ip.product_id and r.run_id=ip.run_id and r.kind='protection requirement'),0)) available from app.inventory_positions ip join app.locations l on l.id=ip.site_id where ip.run_id=$1 and ip.product_id=$2 and l.city='Utrecht'",
    [run.id, s.product_id],
  );
  return {
    available: true,
    shipment: s,
    initialStock: Number(position.quantity),
    dailyDemand: Number(demand[0].quantity),
    projection,
    shortageUnits,
    gapDays,
    orderExposure: exposure,
    receipts,
    orderLines: affected,
    donor: exactDonor || donor,
  };
}
export async function caseDetail(
  db: Db,
  run: any,
  caseId: string,
  role?: string,
) {
  const c = await getCase(db, run, caseId, role);
  const shipment = await one(db, shipmentSelect + " where s.id=$1", [
    c.shipment_id,
  ]);
  return {
    case: c,
    shipment,
    events: await rows(
      db,
      "select * from app.case_events where case_id=$1 order by created_at desc",
      [c.id],
    ),
    milestones: await rows(
      db,
      "select m.*,l.name location_name from app.milestone_events m left join app.locations l on l.id=m.location_id where m.shipment_id=$1 order by m.observed_at desc,m.created_at desc",
      [c.shipment_id],
    ),
    actions: await rows(
      db,
      "select * from app.actions where case_id=$1 order by created_at desc",
      [c.id],
    ),
    communications: await rows(
      db,
      "select * from app.communications where case_id=$1 order by created_at desc",
      [c.id],
    ),
    references: await rows(
      db,
      "select * from app.external_references where shipment_id=$1",
      [c.shipment_id],
    ),
    documents: await rows(
      db,
      "select id,name,kind,mime_type,status,content from app.documents where shipment_id=$1",
      [c.shipment_id],
    ),
    impact:
      c.kind === "stock_gap"
        ? await projectionFor(db, run, c.shipment_id)
        : null,
    notifications: await rows(
      db,
      "select n.*,coalesce((select jsonb_agg(jsonb_build_object('status',a.status,'provider',a.provider,'error',a.error_code)) from app.notification_attempts a where a.notification_id=n.id),'[]') attempts from app.notifications n where case_id=$1 order by created_at desc",
      [c.id],
    ),
  };
}
async function actorName(db: Db, scope: Scope) {
  return (
    (
      await one(
        db,
        "select name from app.memberships where tenant_id=$1 and user_id=$2 and active",
        [scope.tenantId, scope.userId],
      )
    )?.name || "Workspace member"
  );
}
export async function bootstrap(db: Db, scope: Scope) {
  const run = await activeRun(db, scope.tenantId);
  const cases = await rows(
    db,
    caseSelect +
      " where c.run_id=$1 " +
      (scope.role === "partner" ? " and d.country='NL' " : "") +
      " order by (case c.severity when 'critical' then 0 when 'high' then 1 when 'medium' then 2 else 3 end),c.exposure desc,c.due_at",
    [run.id],
  );
  const shipments = await rows(
    db,
    shipmentSelect +
      " where s.run_id=$1 " +
      (scope.role === "partner" ? " and d.country='NL' " : "") +
      " order by s.reference limit 500",
    [run.id],
  );
  const opened = cases.filter((c) => c.state !== "resolved");
  const activity = await rows(
    db,
    "select e.*,c.reference,c.title case_title from app.case_events e join app.exception_cases c on c.id=e.case_id where e.run_id=$1 order by e.created_at desc limit 12",
    [run.id],
  );
  const featured = shipments.find((s) => s.reference === "DEMO-SHP-0101");
  return {
    run,
    user: {
      id: scope.userId,
      role: scope.role,
      name: await actorName(db, scope),
    },
    cases,
    shipments,
    activity:
      scope.role === "partner"
        ? activity.filter((e) => cases.some((c) => c.id === e.case_id))
        : activity,
    featured,
    stats: {
      shipments: shipments.length,
      activeShipments: shipments.filter((s) => s.status !== "delivered").length,
      cases: opened.length,
      critical: opened.filter((c) => c.severity === "critical").length,
      exposure: opened.reduce((n, c) => n + Number(c.exposure), 0),
      freeTime: opened.filter((c) => c.kind === "free_time").length,
      resolved: cases.filter((c) => c.state === "resolved").length,
    },
    scenarioTemplates:
      scope.role === "presenter"
        ? await rows(
            db,
            "select * from app.scenario_templates where run_id=$1 order by code",
            [run.id],
          )
        : [],
    integrations:
      scope.role === "partner"
        ? []
        : await rows(
            db,
            "select id,name,status,last_success_at,mode from app.integration_connections where run_id=$1 order by name",
            [run.id],
          ),
  };
}
export async function acknowledge(
  db: Db,
  scope: Scope,
  caseId: string,
  expectedRun: string,
) {
  const run = await activeRun(db, scope.tenantId);
  assertCurrentRun(expectedRun, run.id);
  const c = await getCase(db, run, caseId, scope.role);
  if (c.acknowledged_at) return c;
  await db.query(
    "update app.exception_cases set acknowledged_at=now(),state=case when state='new' then 'owned' else state end,version=version+1 where id=$1",
    [c.id],
  );
  await caseEvent(
    db,
    run,
    c.id,
    "acknowledged",
    "Acknowledged by " + (await actorName(db, scope)),
    "Ownership accepted; the shipment risk still requires resolution.",
    await actorName(db, scope),
  );
  await db.query(
    "insert into app.notification_events(tenant_id,run_id,notification_id,kind,provenance) select tenant_id,run_id,id,'acknowledged','authenticated user' from app.notifications where case_id=$1",
    [c.id],
  );
  await emit(db, run, "case_updated", { caseId: c.id });
  return getCase(db, run, c.id);
}
export async function proposeAction(
  db: Db,
  scope: Scope,
  caseId: string,
  kind: string,
  expectedRun: string,
  options: any = {},
) {
  const run = await activeRun(db, scope.tenantId);
  assertCurrentRun(expectedRun, run.id);
  const c = await getCase(db, run, caseId, scope.role);
  if (c.state === "resolved")
    throw Object.assign(new Error("This case is resolved."), {
      statusCode: 409,
    });
  const contact = await one(
    db,
    "select * from app.contacts where party_id=$1 limit 1",
    [c.provider_id],
  );
  const payload: any = {
    recipient: contact?.email || "operations@partner.example",
    subject: "Recovery plan requested · " + c.shipment_reference,
    body:
      "Hello " +
      (contact?.name || "Operations team") +
      ",\n\nPlease confirm the latest status and recovery plan for " +
      c.shipment_reference +
      ". " +
      c.summary +
      "\n\nPlease share the expected next milestone and any support required.\n\nRegards,\n" +
      (await actorName(db, scope)),
    followUpHours: 2,
    simulated: true,
  };
  const titles: Record<string, string> = {
    followup: "Request a recovery update",
    escalate: "Escalate to the regional lead",
    transfer: "Approve alternate stock transfer",
    assign: "Assign a destination planner",
    resolve: "Record an explicit resolution",
  };
  if (kind === "transfer") {
    const impact = await projectionFor(db, run, c.shipment_id);
    if (!impact.available || Number(impact.donor?.available) < 3000)
      throw Object.assign(
        new Error(
          "The donor does not have sufficient uncommitted, unprotected stock.",
        ),
        { statusCode: 409 },
      );
    Object.assign(payload, {
      donorId: impact.donor.site_id,
      donorName: impact.donor.name,
      quantity: 3000,
      arrivalAt: addDays(run.anchor_at, 5),
      cost: 1200,
      currency: "EUR",
      protectedStock: 3000,
      body: "Move 3,000 units from Utrecht to Lyon, available at the start of D+5. Estimated transfer cost EUR 1,200. Donor commitments and protected stock are preserved.",
    });
  }
  if (kind === "assign") {
    const member = await one(
      db,
      "select * from app.memberships where tenant_id=$1 and role='planner' and active limit 1",
      [scope.tenantId],
    );
    if (!member)
      throw Object.assign(new Error("No active planner is available"), {
        statusCode: 409,
      });
    Object.assign(payload, {
      assignee: member.name,
      assigneeId: member.user_id,
      body:
        "Assign the response to " +
        member.name +
        ", EMEA replenishment planner.",
    });
  }
  if (kind === "escalate")
    Object.assign(payload, {
      recipient: "regional.lead@partner.example",
      subject: "Escalation · " + c.shipment_reference,
      body:
        "The requested response is overdue. Please assign a recovery owner and confirm the next milestone.\n\n" +
        c.summary,
    });
  if (kind === "resolve")
    Object.assign(payload, {
      body: options.reason || "",
      resolutionReason: options.reason || "",
    });
  if (options.body && kind === "followup") payload.body = options.body;
  const a = await insert(
    db,
    "actions",
    scoped(run, {
      case_id: c.id,
      kind,
      title: titles[kind],
      payload: JSON.stringify(payload),
      status: "pending_approval",
      created_by: scope.userId,
      due_at: addDays(run.business_at, 2 / 24),
    }),
  );
  await caseEvent(
    db,
    run,
    c.id,
    "action_proposed",
    a.title,
    "Prepared for review. No external message or commitment has been made.",
    "Response assistant",
  );
  await audit(db, run, scope.userId, "action.proposed", a.id);
  return a;
}
export async function executeAction(
  db: Db,
  scope: Scope,
  actionId: string,
  version: number,
  expectedRun: string,
) {
  const run = await activeRun(db, scope.tenantId);
  assertCurrentRun(expectedRun, run.id);
  const action = await one(
    db,
    "select * from app.actions where id=$1 and run_id=$2 for update",
    [actionId, run.id],
  );
  if (!action)
    throw Object.assign(new Error("Action not found."), { statusCode: 404 });
  if (action.status === "executed") return action;
  if (action.version !== version || action.status !== "pending_approval")
    throw Object.assign(
      new Error("Action changed. Review the current version."),
      { statusCode: 409 },
    );
  const c = await getCase(db, run, action.case_id, scope.role);
  const p = action.payload;
  if (c.state === "resolved")
    throw Object.assign(new Error("The case was already resolved."), {
      statusCode: 409,
    });
  if (
    action.kind === "transfer" &&
    !["presenter", "manager"].includes(scope.role)
  )
    throw Object.assign(
      new Error("A manager must approve the stock transfer."),
      { statusCode: 403 },
    );
  if (
    action.kind === "resolve" &&
    (!p.resolutionReason || p.resolutionReason.trim().length < 15)
  )
    throw Object.assign(
      new Error("Add a meaningful resolution decision or evidence reference."),
      { statusCode: 400 },
    );
  await insert(
    db,
    "approvals",
    scoped(run, {
      action_id: action.id,
      action_version: version,
      decision: "approved",
      actor: scope.userId,
      payload_hash: createHash("sha256")
        .update(JSON.stringify(p))
        .digest("hex"),
    }),
  );
  if (["followup", "escalate"].includes(action.kind)) {
    const msg = await insert(
      db,
      "communications",
      scoped(run, {
        case_id: c.id,
        action_id: action.id,
        direction: "outbound",
        recipient: p.recipient,
        subject: p.subject,
        body: p.body,
        status: "simulated_sent",
        simulated: true,
      }),
    );
    await insert(
      db,
      "outbox_jobs",
      scoped(run, {
        communication_id: msg.id,
        status: "simulated_delivered",
        attempts: 1,
        result: JSON.stringify({ simulated: true }),
      }),
    );
    await insert(
      db,
      "scheduled_jobs",
      scoped(run, {
        case_id: c.id,
        action_id: action.id,
        kind: "followup",
        clock_domain: "business",
        due_at: addDays(run.business_at, 2 / 24),
        status: "pending",
        operation_key: "followup:" + action.id,
      }),
    );
    await db.query(
      "update app.exception_cases set state=$2,version=version+1 where id=$1",
      [c.id, action.kind === "escalate" ? "escalated" : "waiting"],
    );
  } else if (action.kind === "transfer") {
    const impact = await projectionFor(db, run, c.shipment_id);
    if (!impact.available || Number(impact.donor?.available) < p.quantity)
      throw Object.assign(
        new Error("Donor stock changed; prepare a new option."),
        { statusCode: 409 },
      );
    const existing = await one(
      db,
      "select id from app.inbound_plans where run_id=$1 and product_id=$2 and kind='transfer' and status='planned'",
      [run.id, c.product_id],
    );
    if (existing)
      throw Object.assign(
        new Error("A transfer is already planned for this scenario."),
        { statusCode: 409 },
      );
    const option = await insert(
      db,
      "planning_options",
      scoped(run, {
        case_id: c.id,
        shipment_id: c.shipment_id,
        kind: "transfer",
        title: "Utrecht → Lyon",
        quantity: p.quantity,
        arrival_at: p.arrivalAt,
        cost: p.cost,
        feasible: true,
        reason: "Donor commitments and protection floor preserved",
        inputs: JSON.stringify(p),
      }),
    );
    await insert(
      db,
      "planning_decisions",
      scoped(run, {
        option_id: option.id,
        action_id: action.id,
        status: "approved",
        decided_by: scope.userId,
        evidence: "Simulated operational decision; execution still pending.",
      }),
    );
    await insert(
      db,
      "inbound_plans",
      scoped(run, {
        product_id: c.product_id,
        destination_id: c.destination_id,
        quantity: p.quantity,
        usable_at: p.arrivalAt,
        kind: "transfer",
        status: "planned",
      }),
    );
    await insert(
      db,
      "inventory_reservations",
      scoped(run, {
        site_id: p.donorId,
        product_id: c.product_id,
        quantity: p.quantity,
        kind: "approved transfer",
      }),
    );
    await db.query(
      "update app.inventory_positions set reserved=reserved+$3 where run_id=$1 and site_id=$2 and product_id=$4",
      [run.id, p.donorId, p.quantity, c.product_id],
    );
    await db.query(
      "update app.exception_cases set state='waiting',next_action='Verify transfer receipt',version=version+1 where id=$1",
      [c.id],
    );
  } else if (action.kind === "assign")
    await db.query(
      "update app.exception_cases set owner_name=$2,owner_user_id=$3,state='owned',version=version+1 where id=$1",
      [c.id, p.assignee, p.assigneeId],
    );
  else if (action.kind === "resolve")
    await db.query(
      "update app.exception_cases set state='resolved',resolved_at=now(),version=version+1 where id=$1",
      [c.id],
    );
  const result = {
    simulated: true,
    message:
      action.kind === "transfer"
        ? "Transfer approved; receipt verification pending."
        : action.kind === "resolve"
          ? "Explicit resolution recorded."
          : "Action recorded in the demo workspace.",
  };
  await db.query(
    "update app.actions set status='executed',executed_at=now(),result=$2 where id=$1",
    [action.id, JSON.stringify(result)],
  );
  await caseEvent(
    db,
    run,
    c.id,
    "action_executed",
    action.title,
    result.message,
    await actorName(db, scope),
  );
  await audit(db, run, scope.userId, "action.executed", action.id, { version });
  await emit(db, run, "case_updated", { caseId: c.id });
  return { ...action, status: "executed", result };
}
export async function partnerReply(
  db: Db,
  scope: Scope,
  caseId: string,
  expectedRun: string,
) {
  const run = await activeRun(db, scope.tenantId);
  assertCurrentRun(expectedRun, run.id);
  const c = await getCase(db, run, caseId);
  const reply =
    "We have assigned an operations owner. The revised arrival is confirmed and a recovery plan is under review. We will provide the next update within two hours. This reply does not confirm customs clearance or physical delivery.";
  await insert(
    db,
    "communications",
    scoped(run, {
      case_id: c.id,
      direction: "inbound",
      recipient: "operations@partner.example",
      subject: "Re: " + c.shipment_reference,
      body: reply,
      status: "received",
      simulated: true,
      extracted: JSON.stringify({
        ownerAssigned: true,
        clearanceConfirmed: false,
      }),
    }),
  );
  await db.query(
    "update app.scheduled_jobs set status='satisfied' where case_id=$1 and status='pending'",
    [c.id],
  );
  await caseEvent(
    db,
    run,
    c.id,
    "partner_reply",
    "Partner update received",
    reply,
    "Simulated partner",
  );
  await emit(db, run, "case_updated", { caseId: c.id });
  return {
    message: "Partner reply recorded. Physical milestones remain unconfirmed.",
  };
}
export async function runNetworkScenario(
  db: Db,
  run: any,
  scope: Scope,
  kind: string,
  inputs: any,
) {
  const suppliers = await rows(
    db,
    "select * from app.parties where run_id=$1 and kind='supplier' order by name",
    [run.id],
  );
  const supplierId = inputs.supplierId || suppliers[0]?.id;
  const days = Math.min(30, Math.max(1, Number(inputs.days) || 7)),
    tariff = Math.min(50, Math.max(0, Number(inputs.tariff) || 10));
  const components = await rows(
    db,
    "select b.product_id parent_id,c.component_id,c.quantity,c.yield_factor from app.bom_components c join app.bom_versions b on b.id=c.bom_id where c.run_id=$1 and b.active and (b.valid_to is null or b.valid_to >= $2::date)",
    [run.id, run.business_at],
  );
  const source = await rows(
    db,
    "select * from app.sourcing_options where run_id=$1 and supplier_id=$2 and active and approved",
    [run.id, supplierId],
  );
  const affected = new Set<string>(source.map((x) => x.product_id));
  let changed = true;
  while (changed) {
    changed = false;
    for (const c of components)
      if (affected.has(c.component_id) && !affected.has(c.parent_id)) {
        affected.add(c.parent_id);
        changed = true;
      }
  }
  const products = await rows(
    db,
    "select * from app.products where run_id=$1",
    [run.id],
  );
  const affectedFg = products.filter(
    (p) => p.kind === "FG" && affected.has(p.id),
  );
  const alternatives = await rows(
    db,
    "select o.*,p.name supplier,pr.name product from app.sourcing_options o join app.parties p on p.id=o.supplier_id join app.products pr on pr.id=o.product_id where o.run_id=$1 and o.supplier_id<>$2 and o.active and o.approved and o.capacity>0",
    [run.id, supplierId],
  );
  const shipments = await rows(
    db,
    shipmentSelect + " where s.run_id=$1 and s.status<>'delivered'",
    [run.id],
  );
  const impacted =
    kind === "supplier"
      ? shipments.filter((s) => affected.has(s.product_id))
      : shipments.filter((s) => s.country === (inputs.country || "FR"));
  const baseValue = impacted.reduce((n, s) => n + Number(s.value), 0);
  const result = {
    kind,
    days,
    tariffRate: tariff,
    affectedProducts:
      kind === "supplier"
        ? affectedFg.length
        : new Set(impacted.map((s) => s.product_id)).size,
    shipments: impacted.length,
    exposedOrderValue: baseValue,
    incrementalCost:
      kind === "tariff"
        ? Math.round((baseValue * tariff) / 100)
        : impacted.length * 240,
    alternativeSources: alternatives
      .filter((a) => affected.has(a.product_id))
      .map((a) => ({
        supplier: a.supplier,
        product: a.product,
        capacity: Number(a.capacity),
        leadDays: a.lead_days,
        cost: Number(a.unit_cost),
      })),
    products: affectedFg.map((p) => ({ id: p.id, code: p.code, name: p.name })),
    assumptions: [
      "Synthetic scenario; operational baseline unchanged.",
      kind === "tariff"
        ? "Hypothetical tariff applied to declared shipment value; not a verified tariff rate."
        : "Capacity and approved sourcing are evaluated from the current fixture.",
      "Exposure is not realized loss.",
    ],
  };
  const scenario = await insert(
    db,
    "network_scenarios",
    scoped(run, {
      name:
        kind === "supplier"
          ? "Supplier interruption"
          : kind === "tariff"
            ? "Hypothetical tariff change"
            : "Route disruption",
      kind,
      inputs: JSON.stringify({ ...inputs, supplierId, days, tariff }),
      status: "complete",
      created_by: scope.userId,
    }),
  );
  await insert(
    db,
    "scenario_results",
    scoped(run, { scenario_id: scenario.id, result: JSON.stringify(result) }),
  );
  return { id: scenario.id, ...result };
}
export async function demoCommand(
  db: Db,
  scope: Scope,
  code: string,
  commandId: string,
  expectedRun: string,
  caseId?: string,
) {
  const run = await activeRun(db, scope.tenantId);
  assertCurrentRun(expectedRun, run.id);
  await db.query("select pg_advisory_xact_lock(hashtext($1))", [run.id]);
  assertCurrentRun(run.id, (await activeRun(db, scope.tenantId)).id);
  const completed = await one(
    db,
    "select result from app.demo_commands where run_id=$1 and scenario=$2",
    [run.id, code],
  );
  if (completed) return completed.result;
  const seen = await one(
    db,
    "select result from app.demo_commands where run_id=$1 and command_id=$2",
    [run.id, commandId],
  );
  if (seen) return seen.result;
  const featured = await one(
    db,
    "select * from app.shipments where run_id=$1 and reference='DEMO-SHP-0101'",
    [run.id],
  );
  let result: any = {};
  let c: any;
  if (code === "S01") {
    await db.query(
      "update app.shipments set usable_eta=$2,delivery_eta=$3,port_eta=$4,status='in_transit',version=version+1,last_observed_at=$5 where id=$1",
      [
        featured.id,
        addDays(run.anchor_at, 9),
        addDays(run.anchor_at, 8),
        addDays(run.anchor_at, 6),
        run.business_at,
      ],
    );
    await db.query(
      "update app.inbound_plans set usable_at=$2 where shipment_id=$1",
      [featured.id, addDays(run.anchor_at, 9)],
    );
    const observation = await insert(
      db,
      "source_observations",
      scoped(run, {
        shipment_id: featured.id,
        external_id: commandId,
        payload: JSON.stringify({
          type: "eta_revision",
          usable_day: 9,
          old_usable_day: 4,
        }),
        occurred_at: run.business_at,
        source_observed_at: run.business_at,
      }),
    );
    await insert(
      db,
      "milestone_events",
      scoped(run, {
        shipment_id: featured.id,
        kind: "usable_receipt",
        qualifier: "estimated",
        occurred_at: addDays(run.anchor_at, 9),
        observed_at: run.business_at,
        source_id: observation.id,
        revision: 2,
        detail: "Revised receipt · D+4 → D+9",
      }),
    );
    c = await ensureCase(
      db,
      run,
      scope,
      featured,
      "stock_gap",
      "Receipt delayed · stock gap in Lyon",
      "The revised usable receipt leaves three days without stock coverage. A 3,000-unit alternate transfer can bridge the gap.",
      "critical",
    );
    const impact = await projectionFor(db, run, featured.id);
    await db.query(
      "update app.exception_cases set shortage_units=$2,gap_days=$3,exposure=$4,version=version+1 where id=$1",
      [c.id, impact.shortageUnits, impact.gapDays, impact.orderExposure],
    );
    await insert(
      db,
      "impact_assessments",
      scoped(run, {
        case_id: c.id,
        shipment_id: featured.id,
        calculation_version: "stock-v1",
        inputs: JSON.stringify({
          initial: impact.initialStock,
          demand: impact.dailyDemand,
          receipts: impact.receipts,
        }),
        result: JSON.stringify(impact),
        calculated_at: run.business_at,
      }),
    );
    c = await getCase(db, run, c.id);
    await notify(db, run, c, commandId);
    result = {
      caseId: c.id,
      message: "ETA revised. Stock gap calculated and notification queued.",
    };
  } else if (code === "S02") {
    const s = await one(
      db,
      "select * from app.shipments where run_id=$1 and reference='DEMO-SHP-0102'",
      [run.id],
    );
    await db.query(
      "update app.customs_cases set arrival_at=$2,started_at=null,status='documents_missing',cause='Commercial declaration missing' where shipment_id=$1",
      [s.id, addDays(run.business_at, -1)],
    );
    await db.query(
      "update app.customs_requirements set status='missing' where customs_id in(select id from app.customs_cases where shipment_id=$1)",
      [s.id],
    );
    c = await ensureCase(
      db,
      run,
      scope,
      s,
      "customs",
      "Clearance document missing",
      "Arrival is confirmed; customs start is unknown. Request the commercial declaration and broker status.",
    );
    await notify(db, run, c, commandId);
    result = { caseId: c.id, message: "Customs evidence gap created." };
  } else if (code === "S03") {
    const s = await one(
      db,
      "select * from app.shipments where run_id=$1 and reference='DEMO-SHP-0103'",
      [run.id],
    );
    const rule = await one(
      db,
      "select * from app.charge_rules where run_id=$1 limit 1",
      [run.id],
    );
    const rates = await rows(
      db,
      "select * from app.charge_tiers where rule_id=$1 order by from_day",
      [rule.id],
    );
    const calculatedAt = new Date(
      Math.max(
        new Date(run.business_at).getTime(),
        new Date(addDays(run.anchor_at, 3)).getTime(),
      ),
    ).toISOString();
    const chargeDays = Math.floor(
      (new Date(calculatedAt).getTime() - new Date(run.anchor_at).getTime()) /
        86400000,
    );
    const containers = await rows(
      db,
      "select container_id from app.shipment_container_links where shipment_id=$1",
      [s.id],
    );
    const calc = chargeEstimate(
      chargeDays,
      containers.length,
      rates.map((r) => ({
        from: r.from_day,
        to: r.to_day || Infinity,
        rate: Number(r.rate),
      })),
    );
    await db.query("update app.demo_runs set business_at=$2 where id=$1", [
      run.id,
      calculatedAt,
    ]);
    run.business_at = calculatedAt;
    await db.query(
      "update app.customs_cases set arrival_at=$2,free_until=$3,status='in_progress' where shipment_id=$1",
      [s.id, addDays(run.anchor_at, -4), run.anchor_at],
    );
    await db.query(
      "update app.container_trips set free_until=$2 where id=any($1::uuid[])",
      [containers.map((x) => x.container_id), run.anchor_at],
    );
    await insert(
      db,
      "milestone_events",
      scoped(run, {
        shipment_id: s.id,
        kind: "port_arrival",
        qualifier: "actual",
        occurred_at: addDays(run.anchor_at, -4),
        observed_at: calculatedAt,
        detail: "Synthetic arrival evidence for the free-time scenario.",
      }),
    );
    await insert(
      db,
      "charge_calculations",
      scoped(run, {
        shipment_id: s.id,
        rule_id: rule.id,
        charge_days: chargeDays,
        units: containers.length,
        amount: calc.amount,
        breakdown: JSON.stringify(calc.breakdown),
        calculated_at: run.business_at,
      }),
    );
    const title = "Free time expired · EUR " + calc.amount + " exposure";
    c = await ensureCase(
      db,
      run,
      scope,
      s,
      "free_time",
      title,
      containers.length +
        " containers have entered " +
        chargeDays +
        " chargeable calendar days. Review the clearance and pickup plan.",
    );
    await notify(db, run, c, commandId);
    result = {
      caseId: c.id,
      message:
        chargeDays +
        " chargeable days calculated: EUR " +
        calc.amount +
        " for " +
        containers.length +
        " containers.",
    };
  } else if (code === "S04") {
    c = caseId
      ? await getCase(db, run, caseId)
      : await one(
          db,
          "select * from app.exception_cases where run_id=$1 and state<>'resolved' order by created_at desc limit 1",
          [run.id],
        );
    const pending = await one(
      db,
      "select * from app.scheduled_jobs where case_id=$1 and kind='followup' and status='pending' order by due_at limit 1",
      [c.id],
    );
    if (!pending)
      throw Object.assign(
        new Error(
          "First approve a follow-up on the selected case, then invoke the unanswered-response scenario.",
        ),
        { statusCode: 409 },
      );
    await db.query(
      "update app.demo_runs set business_at=greatest(business_at,$2) where id=$1",
      [run.id, pending.due_at],
    );
    run.business_at = pending.due_at;
    await db.query("update app.scheduled_jobs set status='fired' where id=$1", [
      pending.id,
    ]);
    await db.query(
      "update app.exception_cases set state='escalated',severity='critical',version=version+1,next_action='Request regional intervention' where id=$1",
      [c.id],
    );
    await caseEvent(
      db,
      run,
      c.id,
      "escalated",
      "Response deadline breached",
      "Demo evidence: no partner response within the configured two-hour window. Escalated to the regional operations lead.",
    );
    await notify(db, run, { ...c, severity: "critical" }, commandId);
    result = { caseId: c.id, message: "Overdue response escalated." };
  } else if (code === "S05") {
    const s = await one(
      db,
      "select * from app.shipments where run_id=$1 and reference='DEMO-SHP-0105'",
      [run.id],
    );
    const exposure = allocateExposure([
      { lineId: "shared", ordered: 3000, allocated: 1500, unitPrice: 20 },
      { lineId: "shared", ordered: 3000, allocated: 1500, unitPrice: 20 },
    ]);
    c = await ensureCase(
      db,
      run,
      scope,
      s,
      "shared_order",
      "Two trips · one customer order",
      "Two 1,500-unit allocations serve the same 3,000-unit order. Total exposed order value is EUR 60,000.",
      "high",
    );
    const doc = await insert(
      db,
      "business_documents",
      scoped(run, {
        kind: "customer_order",
        reference: "DEMO-SO-SHARED-" + commandId.slice(0, 6),
        currency: "EUR",
        total: 60000,
      }),
    );
    const line = await insert(
      db,
      "business_document_lines",
      scoped(run, {
        document_id: doc.id,
        product_id: s.product_id,
        line_number: 1,
        quantity: 3000,
        unit_price: 20,
        required_at: run.business_at,
        destination_id: s.destination_id,
      }),
    );
    const other = await one(
      db,
      "select * from app.shipments where run_id=$1 and reference='DEMO-SHP-0185'",
      [run.id],
    );
    for (const sid of [s.id, other.id])
      await insert(
        db,
        "shipment_line_allocations",
        scoped(run, { shipment_id: sid, line_id: line.id, quantity: 1500 }),
      );
    await db.query("update app.exception_cases set exposure=$2 where id=$1", [
      c.id,
      exposure,
    ]);
    result = {
      caseId: c.id,
      message: "Shared allocation reconciled to EUR 60,000, counted once.",
    };
  } else if (code === "S06") {
    const ref = await one(
      db,
      "select * from app.external_references where run_id=$1 order by value limit 1",
      [run.id],
    );
    const other = await one(
      db,
      "select id from app.shipments where run_id=$1 and reference='DEMO-SHP-0102'",
      [run.id],
    );
    await db.query(
      "update app.external_references set verified=false where id=$1",
      [ref.id],
    );
    for (const sid of [featured.id, other.id])
      await insert(
        db,
        "reference_matches",
        scoped(run, {
          reference_id: ref.id,
          candidate_shipment_id: sid,
          status: "candidate",
          evidence: "Issuer-scoped reference needs document validation.",
        }),
      );
    await insert(
      db,
      "data_quality_issues",
      scoped(run, {
        shipment_id: featured.id,
        reference_id: ref.id,
        kind: "ambiguous_reference",
        severity: "high",
        title: "Housebill matches two candidates",
        detail: "Review the PO and housebill evidence before linking.",
        status: "open",
      }),
    );
    await insert(
      db,
      "milestone_events",
      scoped(run, {
        shipment_id: featured.id,
        kind: "usable_receipt",
        qualifier: "estimated",
        occurred_at: addDays(run.anchor_at, 14),
        observed_at: run.business_at,
        cancelled: true,
        revision: 99,
        detail: "Cancelled provider revision; excluded from current ETA.",
      }),
    );
    result = {
      message:
        "Conflicting evidence added. The cancelled ETA did not overwrite the current estimate.",
    };
  } else if (code === "S07" || code === "S08") {
    result = await runNetworkScenario(
      db,
      run,
      scope,
      code === "S07" ? "supplier" : "tariff",
      { days: 7, tariff: 10, country: "FR" },
    );
    result.message = "Scenario calculated; operational baseline unchanged.";
  } else if (code === "S09") {
    c = await one(
      db,
      "select * from app.exception_cases where run_id=$1 and shipment_id=$2 and kind='stock_gap' and state<>'resolved'",
      [run.id, featured.id],
    );
    const transfer = await one(
      db,
      "select * from app.inbound_plans where run_id=$1 and kind='transfer' and status='planned'",
      [run.id],
    );
    if (!c || !transfer)
      throw Object.assign(
        new Error(
          "First trigger S01 and approve the alternate transfer in the case.",
        ),
        { statusCode: 409 },
      );
    await db.query(
      "update app.inbound_plans set status='received' where id=$1",
      [transfer.id],
    );
    const at = addDays(run.anchor_at, 5);
    await db.query(
      "update app.demo_runs set business_at=greatest(business_at,$2) where id=$1",
      [run.id, at],
    );
    run.business_at = at;
    await insert(
      db,
      "milestone_events",
      scoped(run, {
        shipment_id: featured.id,
        kind: "transfer_received",
        qualifier: "actual",
        occurred_at: at,
        observed_at: at,
        detail: "Synthetic receipt evidence: 3,000 units received in Lyon.",
      }),
    );
    await db.query(
      "update app.exception_cases set state='resolved',resolved_at=now(),shortage_units=0,gap_days=0,exposure=0,next_action='Continue tracking delayed shipment',version=version+1 where id=$1",
      [c.id],
    );
    await caseEvent(
      db,
      run,
      c.id,
      "resolved",
      "Stock gap mitigated · receipt verified",
      "Transfer receipt is confirmed. The original ocean shipment remains delayed and is still being tracked.",
    );
    result = {
      caseId: c.id,
      message: "Stock-risk case resolved with receipt evidence.",
    };
  } else
    throw Object.assign(new Error("Unknown scenario"), { statusCode: 400 });
  await insert(
    db,
    "demo_commands",
    scoped(run, {
      command_id: commandId,
      scenario: code,
      actor: scope.userId,
      status: "complete",
      result: JSON.stringify(result),
    }),
  );
  await audit(db, run, scope.userId, "demo." + code, c?.id || null, {
    commandId,
  });
  await emit(db, run, "demo_updated", result);
  return result;
}
