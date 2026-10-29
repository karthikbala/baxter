import { createHash, randomUUID } from "node:crypto";
import type { Db } from "../db";
import { insert, one } from "../db";
import { addDays } from "../domain/calculations";

export const scenarios = [
  [
    "S01",
    "ETA threatens replenishment",
    "Move usable receipt from D+4 to D+9. Explain the three-day stock gap and notify the planner.",
    "critical",
  ],
  [
    "S02",
    "Customs document gap",
    "Request the missing declaration and trace the broker response.",
    "high",
  ],
  [
    "S03",
    "Free-time deadline",
    "Move two containers into the chargeable period and calculate the contract tiers.",
    "high",
  ],
  [
    "S04",
    "No partner response",
    "Advance the follow-up deadline and escalate an unanswered request.",
    "high",
  ],
  [
    "S05",
    "Shared order exposure",
    "Group two delayed trips without double counting the same customer order.",
    "medium",
  ],
  [
    "S06",
    "Conflicting source data",
    "Surface a cancelled ETA and an ambiguous housebill reference.",
    "medium",
  ],
  [
    "S07",
    "Supplier disruption",
    "Trace a material shortage through the BOM and compare approved sourcing.",
    "critical",
  ],
  [
    "S08",
    "Route and tariff change",
    "Compare a hypothetical route delay and tariff impact.",
    "medium",
  ],
  [
    "S09",
    "Recovery and closure",
    "Record receipt evidence and close only the risks it resolves.",
    "low",
  ],
] as const;

function seededId(run: string, kind: string, i: number) {
  const hex = createHash("sha256")
    .update(run + kind + i)
    .digest("hex");
  return (
    hex.slice(0, 8) +
    "-" +
    hex.slice(8, 12) +
    "-4" +
    hex.slice(13, 16) +
    "-8" +
    hex.slice(17, 20) +
    "-" +
    hex.slice(20, 32)
  );
}
export async function seedRun(
  db: Db,
  tenantId: string,
  userId: string,
  now = new Date(),
) {
  const runId = randomUUID();
  const anchor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8),
  ).toISOString();
  const savedDevices = (
    await db.query(
      "select d.* from app.devices d join app.demo_runs r on r.id=d.run_id where d.tenant_id=$1 and r.status='active' and d.active",
      [tenantId],
    )
  ).rows;
  await db.query("update app.devices set active=false where tenant_id=$1", [
    tenantId,
  ]);
  await db.query(
    "update app.demo_runs set status='ended' where tenant_id=$1 and status='active'",
    [tenantId],
  );
  await db.query(
    "update app.scheduled_jobs set status='cancelled' where tenant_id=$1 and status='pending'",
    [tenantId],
  );
  await db.query(
    "update app.domain_outbox set status='cancelled' where tenant_id=$1 and status='pending'",
    [tenantId],
  );
  await db.query(
    "insert into app.demo_runs(id,tenant_id,business_at,anchor_at,status) values($1,$2,$3,$3,'active')",
    [runId, tenantId, anchor],
  );
  const id = (kind: string, i: number) => seededId(runId, kind, i);
  const batches = new Map<string, Record<string, unknown>[]>();
  const put = async (
    table: string,
    i: number,
    data: Record<string, unknown>,
  ) => {
    const row = {
      id: id(table, i),
      tenant_id: tenantId,
      run_id: runId,
      ...data,
    };
    const group = batches.get(table) || [];
    group.push(row);
    batches.set(table, group);
    return row;
  };
  const coords = [
    [
      "Rotterdam Gateway",
      "Rotterdam",
      "NL",
      "port",
      51.95,
      4.14,
      "Europe/Amsterdam",
    ],
    ["Hamburg Gateway", "Hamburg", "DE", "port", 53.54, 9.96, "Europe/Berlin"],
    ["Antwerp Gateway", "Antwerp", "BE", "port", 51.26, 4.4, "Europe/Brussels"],
    [
      "Valencia Gateway",
      "Valencia",
      "ES",
      "port",
      39.44,
      -0.32,
      "Europe/Madrid",
    ],
    ["Genoa Gateway", "Genoa", "IT", "port", 44.4, 8.91, "Europe/Rome"],
    [
      "Marseille Gateway",
      "Marseille",
      "FR",
      "port",
      43.34,
      5.33,
      "Europe/Paris",
    ],
    [
      "Felixstowe Gateway",
      "Felixstowe",
      "GB",
      "port",
      51.95,
      1.31,
      "Europe/London",
    ],
    ["Gdansk Gateway", "Gdansk", "PL", "port", 54.39, 18.65, "Europe/Warsaw"],
    ["Dubai Gateway", "Dubai", "AE", "port", 24.99, 55.06, "Asia/Dubai"],
    ["Jeddah Gateway", "Jeddah", "SA", "port", 21.48, 39.16, "Asia/Riyadh"],
    [
      "Casablanca Gateway",
      "Casablanca",
      "MA",
      "port",
      33.6,
      -7.6,
      "Africa/Casablanca",
    ],
    [
      "Cape Town Gateway",
      "Cape Town",
      "ZA",
      "port",
      -33.91,
      18.43,
      "Africa/Johannesburg",
    ],
    [
      "Lyon Distribution Centre",
      "Lyon",
      "FR",
      "dc",
      45.76,
      4.84,
      "Europe/Paris",
    ],
    [
      "Utrecht Distribution Centre",
      "Utrecht",
      "NL",
      "dc",
      52.09,
      5.12,
      "Europe/Amsterdam",
    ],
    [
      "Cologne Distribution Centre",
      "Cologne",
      "DE",
      "dc",
      50.94,
      6.95,
      "Europe/Berlin",
    ],
    [
      "Milan Distribution Centre",
      "Milan",
      "IT",
      "dc",
      45.46,
      9.19,
      "Europe/Rome",
    ],
    [
      "Madrid Distribution Centre",
      "Madrid",
      "ES",
      "dc",
      40.42,
      -3.7,
      "Europe/Madrid",
    ],
    [
      "Birmingham Distribution Centre",
      "Birmingham",
      "GB",
      "dc",
      52.48,
      -1.9,
      "Europe/London",
    ],
    [
      "Warsaw Distribution Centre",
      "Warsaw",
      "PL",
      "dc",
      52.23,
      21.01,
      "Europe/Warsaw",
    ],
    [
      "Dubai Distribution Centre",
      "Dubai",
      "AE",
      "dc",
      25.2,
      55.27,
      "Asia/Dubai",
    ],
    ["North Plant", "Brussels", "BE", "plant", 50.85, 4.35, "Europe/Brussels"],
    ["Central Plant", "Prague", "CZ", "plant", 50.08, 14.44, "Europe/Prague"],
    ["West Plant", "Dublin", "IE", "plant", 53.35, -6.26, "Europe/Dublin"],
    ["South Plant", "Rome", "IT", "plant", 41.9, 12.5, "Europe/Rome"],
    [
      "Singapore Origin",
      "Singapore",
      "SG",
      "origin",
      1.26,
      103.84,
      "Asia/Singapore",
    ],
    [
      "Shanghai Origin",
      "Shanghai",
      "CN",
      "origin",
      31.23,
      121.47,
      "Asia/Shanghai",
    ],
  ];
  const providers = [
    "Northstar Logistics",
    "Atlas Freight",
    "Bluewater Cargo",
    "Alpine Transport",
    "Meridian Lines",
    "HarbourLink",
    "Continental Forwarding",
    "Horizon Shipping",
  ];
  for (let i = 0; i < 40; i++) {
    const name =
      i < 8
        ? providers[i]
        : i < 28
          ? "Material partner " + (i - 7)
          : "Clearance partner " + (i - 27);
    await put("parties", i, {
      name,
      kind: i < 8 ? "forwarder" : i < 28 ? "supplier" : "broker",
      country: String(coords[i % 12][2]),
      score: 78 + (i % 19),
      metadata: JSON.stringify({ fictional: true }),
    });
    await put("contacts", i, {
      party_id: id("parties", i),
      name:
        i < 8
          ? [
              "Jamie Foster",
              "Sofia Lind",
              "Luca Rossi",
              "Eva Klein",
              "Omar Aziz",
              "Claire Dubois",
              "Arun Shah",
              "Nora Evans",
            ][i]
          : "Demo Contact " + i,
      email: "contact" + i + "@partner.example",
      title: i < 8 ? "Operations lead" : "Account manager",
    });
  }
  for (let i = 0; i < coords.length; i++) {
    const [name, city, country, kind, lat, lon, timezone] = coords[i];
    await put("locations", i, {
      name,
      city,
      country,
      kind,
      lat,
      lon,
      timezone,
    });
  }
  for (let i = 0; i < 12; i++) {
    await put("calendars", i, {
      name: coords[i][2] + " operating calendar",
      timezone: coords[i][6],
    });
    await put("calendar_dates", i, {
      calendar_id: id("calendars", i),
      date: addDays(anchor, 14).slice(0, 10),
      is_working: false,
      reason: "Synthetic holiday fixture",
    });
  }
  for (let i = 0; i < 200; i++) {
    const fg = i < 80,
      kind = fg ? "FG" : i < 130 ? "RM" : i < 170 ? "PM" : "WIP";
    await put("products", i, {
      code: fg
        ? "DEMO-FG-" + String(i + 1).padStart(3, "0")
        : "DEMO-" + kind + "-" + String(i - 79).padStart(3, "0"),
      name:
        i === 20
          ? "Infusion set · standard"
          : fg
            ? [
                "Care delivery kit",
                "Sterile connector",
                "Fluid administration set",
                "Clinical accessories pack",
              ][i % 4] +
              " " +
              (i + 1)
            : kind === "RM"
              ? "Medical polymer " + (i - 79)
              : kind === "PM"
                ? "Protective packaging " + (i - 129)
                : "Assembly component " + (i - 169),
      kind,
      criticality: i % 7 === 0 || i === 20 ? "essential" : "standard",
      unit_price: fg ? 20 + (i % 8) : 2 + (i % 5),
      hs_code: fg ? "9018.90" : "3901.20",
    });
    await put("unit_conversions", i, {
      product_id: id("products", i),
      from_unit: "case",
      to_unit: "unit",
      factor: 100,
    });
    await put("valuation_inputs", i, {
      product_id: id("products", i),
      site_id: id("locations", 12 + (i % 8)),
      unit_cost: fg ? 12 : 1,
      contribution: fg ? 8 : 1,
      currency: "EUR",
      valid_from: anchor.slice(0, 10),
    });
    await put("sourcing_options", i, {
      product_id: id("products", i),
      supplier_id: id("parties", 8 + (i % 20)),
      site_id: id("locations", 20 + (i % 4)),
      approved: true,
      active: true,
      capacity: 10000 + (i % 4) * 2000,
      lead_days: 7 + (i % 12),
      unit_cost: 12 + (i % 4),
    });
    if (i < 30)
      await put("sourcing_options", 200 + i, {
        product_id: id("products", i),
        supplier_id: id("parties", 8 + ((i + 3) % 20)),
        site_id: id("locations", 20 + ((i + 1) % 4)),
        approved: i % 3 !== 0,
        active: i % 4 !== 0,
        capacity: 5000,
        lead_days: 5 + (i % 4),
        unit_cost: 15,
      });
    if (fg) {
      await put("bom_versions", i, {
        product_id: id("products", i),
        version: 1,
        valid_from: addDays(anchor, -180).slice(0, 10),
        active: true,
      });
      await put("bom_components", i * 2, {
        bom_id: id("bom_versions", i),
        component_id: id("products", 80 + (i % 50)),
        quantity: 1,
        yield_factor: 0.98,
      });
      await put("bom_components", i * 2 + 1, {
        bom_id: id("bom_versions", i),
        component_id: id("products", 130 + (i % 40)),
        quantity: 0.5,
        yield_factor: 1,
      });
    }
  }
  for (let i = 170; i < 175; i++) {
    await put("bom_versions", i, {
      product_id: id("products", i),
      version: 1,
      valid_from: addDays(anchor, -180).slice(0, 10),
      active: true,
    });
    await put("bom_components", i * 2, {
      bom_id: id("bom_versions", i),
      component_id: id("products", 80 + (i % 50)),
      quantity: 2,
      yield_factor: 0.95,
    });
  }
  await put("bom_components", 999, {
    bom_id: id("bom_versions", 20),
    component_id: id("products", 170),
    quantity: 1,
    yield_factor: 1,
  });
  await put("fx_rates", 0, {
    from_currency: "GBP",
    to_currency: "EUR",
    rate: 1.17,
    as_of: anchor.slice(0, 10),
  });
  for (let i = 0; i < 8; i++) {
    await put("lanes", i, {
      origin_id: id("locations", 24 + (i % 2)),
      destination_id: id("locations", i),
      provider_id: id("parties", i),
      mode: "Ocean",
      transit_days: 22 + i,
      capacity: 40000,
      cost: 1600 + i * 100,
    });
    await put("integration_connections", i, {
      name: providers[i],
      provider_id: id("parties", i),
      status: i === 7 ? "stale" : "healthy",
      last_success_at: addDays(anchor, i === 7 ? -3 : 0),
    });
    await put("ingestion_runs", i, {
      connection_id: id("integration_connections", i),
      state: i === 7 ? "overdue" : "success",
      started_at: anchor,
      finished_at: anchor,
      records: 62,
    });
  }
  const caseKinds = [
    "customs",
    "eta",
    "free_time",
    "missing_milestone",
    "no_response",
  ];
  const owners = ["Alex Morgan", "Eva Schmidt", "Sofia Lind", "Luca Rossi"];
  for (let i = 0; i < 500; i++) {
    const delivered = i > 60 && i % 3 === 0,
      delayed = i > 0 && i < 36;
    const product = i === 0 ? 20 : i % 80,
      destination = i === 0 ? 12 : 12 + (i % 8),
      baseline = addDays(
        anchor,
        i === 0 ? 4 : delivered ? -(10 + (i % 170)) : (i % 24) - 8,
      );
    const current = addDays(baseline, delayed ? 2 + (i % 4) : 0),
      quantity = i === 0 ? 6000 : 1000 + (i % 7) * 500;
    const sid = id("shipments", i),
      provider = id("parties", i % 8);
    await put("shipments", i, {
      reference: "DEMO-SHP-" + String(101 + i).padStart(4, "0"),
      origin_id: id("locations", 24 + (i % 2)),
      destination_id: id("locations", destination),
      provider_id: provider,
      owner_name: "Alex Morgan",
      owner_user_id: userId,
      status: delivered ? "delivered" : i % 5 === 0 ? "booked" : "in_transit",
      baseline_eta: baseline,
      port_eta: addDays(current, -2),
      delivery_eta: addDays(current, -1),
      usable_eta: current,
      required_at: addDays(baseline, 1),
      vessel: [
        "Ocean Aurora",
        "Pacific Meridian",
        "Northern Star",
        "Atlantic Spirit",
      ][i % 4],
      quantity,
      product_id: id("products", product),
      value: quantity * 20,
      last_observed_at: anchor,
      metadata: JSON.stringify({
        seed_index: i,
        original_usable_day: i === 0 ? 4 : (i % 24) - 8,
        fictional: true,
      }),
    });
    await put("shipment_legs", i * 2, {
      shipment_id: sid,
      sequence: 1,
      origin_id: id("locations", 24 + (i % 2)),
      destination_id: id("locations", i % 12),
      mode: "Ocean",
      estimated_at: addDays(current, -2),
    });
    await put("shipment_legs", i * 2 + 1, {
      shipment_id: sid,
      sequence: 2,
      origin_id: id("locations", i % 12),
      destination_id: id("locations", destination),
      mode: "Road",
      estimated_at: addDays(current, -1),
    });
    await put("business_documents", i, {
      kind: "purchase_order",
      reference: "DEMO-PO-" + (2000 + i),
      party_id: provider,
      currency: "EUR",
      issued_at: addDays(anchor, -30),
      total: quantity * 20,
    });
    await put("business_document_lines", i, {
      document_id: id("business_documents", i),
      product_id: id("products", product),
      line_number: 1,
      quantity,
      unit_price: 20,
      required_at: addDays(baseline, 1),
      destination_id: id("locations", destination),
    });
    await put("shipment_line_allocations", i, {
      shipment_id: sid,
      line_id: id("business_document_lines", i),
      quantity,
    });
    await put("external_references", i, {
      shipment_id: sid,
      issuer: providers[i % 8],
      kind: "housebill",
      value: "DEMO-HBL-" + (80000 + i),
      verified: true,
    });
    for (let c = 0; c < (i < 300 ? 2 : 1); c++) {
      const n = i * 2 + c;
      await put("container_trips", n, {
        reference: "DEMO-CN-" + String(n + 1).padStart(6, "0"),
        vessel: ["Ocean Aurora", "Pacific Meridian"][i % 2],
        voyage: "DEMO-V" + ((i % 20) + 1),
        status: delivered ? "delivered" : "in_transit",
        free_until: addDays(anchor, 2 + (i % 5)),
      });
      await put("shipment_container_links", n, {
        shipment_id: sid,
        container_id: id("container_trips", n),
        quantity: quantity / (i < 300 ? 2 : 1),
      });
    }
    await put("eta_baselines", i, {
      shipment_id: sid,
      milestone: "usable_receipt",
      eta: baseline,
      frozen_at: addDays(anchor, -25),
    });
    await put("source_observations", i, {
      connection_id: id("integration_connections", i % 8),
      shipment_id: sid,
      external_id: "SEED-" + i,
      payload: JSON.stringify({
        provider: providers[i % 8],
        port_eta: addDays(current, -2),
        delivery_eta: addDays(current, -1),
        status: delivered ? "Delivered" : "In transit",
      }),
      occurred_at: addDays(anchor, -1),
      source_observed_at: anchor,
    });
    for (let e = 0; e < 4; e++)
      await put("milestone_events", i * 4 + e, {
        shipment_id: sid,
        kind: [
          "booking_confirmed",
          "departed_origin",
          "port_arrival",
          "usable_receipt",
        ][e],
        qualifier: e < 2 || delivered ? "actual" : "estimated",
        occurred_at:
          e < 2
            ? addDays(baseline, -30 + e * 5)
            : e === 2
              ? addDays(current, -2)
              : current,
        observed_at: anchor,
        location_id: id(
          "locations",
          e < 2 ? 24 + (i % 2) : e === 2 ? i % 12 : destination,
        ),
        source_id: id("source_observations", i),
        detail:
          e < 2 ? "Provider milestone received" : "Latest estimated milestone",
      });
    if (i < 80) {
      await put("customs_cases", i, {
        shipment_id: sid,
        broker_id: id("parties", 28 + (i % 12)),
        arrival_at: i % 3 === 0 ? addDays(anchor, -2) : null,
        started_at: i % 3 === 0 && i % 4 !== 0 ? addDays(anchor, -1) : null,
        cleared_at: null,
        status:
          i % 4 === 0
            ? "documents_missing"
            : i % 3 === 0
              ? "in_progress"
              : "awaiting_arrival",
        responsible_name: "Local clearance team",
        free_until: addDays(anchor, i === 2 ? 0 : 2 + (i % 5)),
        cause: i % 4 === 0 ? "Commercial declaration pending" : null,
      });
      await put("customs_requirements", i, {
        customs_id: id("customs_cases", i),
        name: "Commercial declaration",
        status: i % 4 === 0 ? "missing" : "received",
        due_at: addDays(anchor, 1),
      });
    }
    if (i >= 1 && i <= 35) {
      const kind = caseKinds[(i - 1) % 5],
        severity = i < 7 ? "critical" : i < 18 ? "high" : "medium";
      const title =
        kind === "customs"
          ? "Clearance update required"
          : kind === "eta"
            ? "Arrival revised · planner review"
            : kind === "free_time"
              ? "Free time approaching expiry"
              : kind === "no_response"
                ? "Forwarder response overdue"
                : "Delivery evidence overdue";
      await put("exception_cases", i, {
        reference: "CASE-" + String(1000 + i),
        shipment_id: sid,
        kind,
        title,
        summary:
          "Latest shipment evidence requires an owner response. Review the source timeline and coordinate the next action.",
        severity,
        state: i % 5 === 0 ? "waiting" : i % 3 === 0 ? "owned" : "new",
        owner_name: "Alex Morgan",
        owner_user_id: userId,
        due_at: addDays(anchor, ((i % 4) + 1) / 4),
        exposure: 0,
        shortage_units: 0,
        gap_days: 0,
        next_action:
          kind === "customs"
            ? "Request clearance update"
            : "Review and follow up",
      });
      await put("case_events", i, {
        case_id: id("exception_cases", i),
        kind: "detected",
        actor: "Rule engine",
        title: "Exception detected",
        detail: "Created from synthetic provider evidence.",
        business_at: anchor,
      });
      await put("case_entities", i, {
        case_id: id("exception_cases", i),
        entity_type: "shipment",
        entity_id: sid,
      });
    }
  }
  // The three exposed customer lines are already represented in the demand forecast.
  await put("business_documents", 600, {
    kind: "customer_order",
    reference: "DEMO-SO-3101",
    party_id: id("parties", 28),
    currency: "EUR",
    issued_at: addDays(anchor, -10),
    total: 60000,
  });
  for (let d = 0; d < 3; d++) {
    await put("business_document_lines", 600 + d, {
      document_id: id("business_documents", 600),
      product_id: id("products", 20),
      line_number: d + 1,
      quantity: 1000,
      unit_price: 20,
      required_at: addDays(anchor, 6 + d),
      destination_id: id("locations", 12),
    });
    await put("document_line_links", 600 + d, {
      source_id: id("business_document_lines", 0),
      target_id: id("business_document_lines", 600 + d),
      quantity: 1000,
    });
  }
  for (let s = 0; s < 8; s++)
    for (let p = 0; p < 80; p++) {
      const n = s * 80 + p,
        qty =
          s === 0 && p === 20
            ? 6000
            : s === 1 && p === 20
              ? 8000
              : 4000 + (n % 12) * 500;
      await put("inventory_positions", n, {
        site_id: id("locations", 12 + s),
        product_id: id("products", p),
        quantity: qty,
        reserved: s === 0 && p === 20 ? 0 : s === 1 && p === 20 ? 2000 : 500,
        status: "released",
        lot: "DEMO-LOT-" + n,
        as_of: anchor,
      });
      for (let d = 0; d < 60; d++)
        await put("demand_buckets", n * 60 + d, {
          site_id: id("locations", 12 + s),
          product_id: id("products", p),
          date: addDays(anchor, d).slice(0, 10),
          quantity: p === 20 ? 1000 : 300 + p * 20,
          basis: "forecast including firm orders",
        });
      await put("capacity_buckets", n, {
        site_id: id("locations", 12 + s),
        product_id: id("products", p),
        date: anchor.slice(0, 10),
        available: qty,
        reserved: 500,
      });
    }
  await put("inventory_reservations", 0, {
    site_id: id("locations", 13),
    product_id: id("products", 20),
    quantity: 2000,
    kind: "customer commitments",
  });
  await put("inventory_reservations", 1, {
    site_id: id("locations", 13),
    product_id: id("products", 20),
    quantity: 3000,
    kind: "protection requirement",
  });
  await put("inbound_plans", 0, {
    shipment_id: id("shipments", 0),
    product_id: id("products", 20),
    destination_id: id("locations", 12),
    quantity: 6000,
    usable_at: addDays(anchor, 4),
    kind: "ocean",
    status: "planned",
  });
  await put("charge_rules", 0, {
    name: "Demo demurrage · calendar days",
    kind: "demurrage",
    free_days: 5,
    calendar_basis: "calendar_day",
    arrival_day_included: true,
    currency: "EUR",
  });
  await put("charge_tiers", 0, {
    rule_id: id("charge_rules", 0),
    from_day: 1,
    to_day: 2,
    rate: 100,
  });
  await put("charge_tiers", 1, {
    rule_id: id("charge_rules", 0),
    from_day: 3,
    to_day: null,
    rate: 150,
  });
  for (let i = 0; i < 9; i++) {
    const [code, name, description, severity] = scenarios[i];
    await put("scenario_templates", i, {
      code,
      name,
      description,
      severity,
      steps: JSON.stringify([
        "Inject evidence",
        "Calculate impact",
        "Assign action",
        "Verify outcome",
      ]),
    });
    await put("exception_rules", i, {
      code,
      name,
      conditions: JSON.stringify({
        kind: code,
        threshold: i === 0 ? 1 : 24,
        clock: "business",
      }),
      enabled: true,
    });
    await put("playbooks", i, {
      code,
      name,
      steps: JSON.stringify([
        "Review evidence",
        "Contact owner",
        "Track response",
        "Verify closure",
      ]),
      owner_role: "coordinator",
    });
  }
  await put("data_quality_issues", 0, {
    shipment_id: id("shipments", 39),
    connection_id: id("integration_connections", 7),
    kind: "stale_feed",
    severity: "medium",
    title: "Provider update overdue",
    detail:
      "No successful observation in three business days. Physical shipment status remains unknown.",
    status: "open",
  });
  await put("documents", 0, {
    shipment_id: id("shipments", 1),
    name: "Commercial declaration · demo",
    kind: "customs_declaration",
    mime_type: "text/plain",
    content:
      "SYNTHETIC DEMONSTRATION DOCUMENT\nShipment DEMO-SHP-0102\nDeclaration awaiting broker validation. No real customer information.",
    status: "received",
  });
  await put("seed_manifests", 0, {
    version: "1.0",
    counts: JSON.stringify({
      shipments: 500,
      containerTrips: 800,
      products: 200,
      initialCases: 35,
    }),
    parameters: JSON.stringify({ anchor, synthetic: true }),
  });
  await put("notification_preferences", 0, {
    user_id: userId,
    critical: true,
    audio_enabled: false,
  });
  for (const [table, items] of batches) {
    const columns = [...new Set(items.flatMap(Object.keys))];
    for (let offset = 0; offset < items.length; offset += 500) {
      const chunk = items.slice(offset, offset + 500);
      const values: unknown[] = [];
      const placeholders = chunk.map(
        (row) =>
          "(" +
          columns
            .map((col) => {
              if (!(col in row)) return "DEFAULT";
              values.push(row[col]);
              return "$" + values.length;
            })
            .join(",") +
          ")",
      );
      await db.query(
        'insert into app."' +
          table +
          '" (' +
          columns.map((c) => '"' + c + '"').join(",") +
          ") values " +
          placeholders.join(","),
        values,
      );
    }
  }
  for (const device of savedDevices)
    await insert(db, "devices", {
      tenant_id: tenantId,
      run_id: runId,
      user_id: device.user_id,
      label: device.label,
      platform: device.platform,
      channel: device.channel,
      credential: JSON.stringify(device.credential),
      last_seen_at: device.last_seen_at,
    });
  return { runId, anchor, featuredShipmentId: id("shipments", 0) };
}
