import Decimal from "decimal.js";
export type Receipt = { day: number; quantity: number; source?: string };
export function stockProjection(
  initial: number,
  demand: number[],
  receipts: Receipt[],
) {
  let balance = initial;
  let backlog = 0;
  let gapUnits = 0;
  return demand.map((quantity, day) => {
    const inbound = receipts
      .filter((r) => r.day === day)
      .reduce((n, r) => n + r.quantity, 0);
    balance += inbound;
    const paid = Math.min(balance, backlog);
    balance -= paid;
    backlog -= paid;
    const fulfilled = Math.min(balance, quantity);
    balance -= fulfilled;
    const unmet = quantity - fulfilled;
    backlog += unmet;
    gapUnits += unmet;
    return {
      day,
      opening: balance + fulfilled,
      inbound,
      demand: quantity,
      onHand: balance,
      unmet,
      backlog,
      cumulativeGap: gapUnits,
    };
  });
}
export function stockImpact(receiptDay = 9, transfer = false) {
  const receipts = [
    { day: receiptDay, quantity: 6000 },
    ...(transfer ? [{ day: 5, quantity: 3000 }] : []),
  ];
  const projection = stockProjection(6000, Array(12).fill(1000), receipts);
  const gapDays = projection.filter((p) => p.unmet > 0).length;
  const shortageUnits = projection.reduce((s, p) => s + p.unmet, 0);
  return {
    projection,
    gapDays,
    shortageUnits,
    orderExposure: new Decimal(shortageUnits).times(20).toNumber(),
    receiptDay,
    transfer,
  };
}
export function chargeEstimate(
  days: number,
  containers = 1,
  tiers = [
    { from: 1, to: 2, rate: 100 },
    { from: 3, to: Infinity, rate: 150 },
  ],
) {
  if (
    !Number.isInteger(days) ||
    days < 0 ||
    !Number.isInteger(containers) ||
    containers < 1
  )
    throw new Error("Invalid charge units");
  let total = new Decimal(0);
  const breakdown = tiers.map((t) => {
    const count = Math.max(0, Math.min(days, t.to) - t.from + 1);
    const amount = new Decimal(count).times(t.rate).times(containers);
    total = total.plus(amount);
    return { days: count, rate: t.rate, containers, amount: amount.toNumber() };
  });
  return { amount: total.toNumber(), currency: "EUR", breakdown };
}
export function allocateExposure(
  lines: {
    lineId: string;
    allocated: number;
    ordered: number;
    unitPrice: number;
  }[],
) {
  const grouped = new Map<
    string,
    { quantity: number; ordered: number; price: number }
  >();
  for (const l of lines) {
    if (l.allocated < 0 || l.ordered < 0 || l.unitPrice < 0)
      throw new Error("Negative allocation");
    const x = grouped.get(l.lineId) || {
      quantity: 0,
      ordered: l.ordered,
      price: l.unitPrice,
    };
    x.quantity += l.allocated;
    grouped.set(l.lineId, x);
  }
  return [...grouped.values()]
    .reduce(
      (sum, l) =>
        sum.plus(new Decimal(Math.min(l.quantity, l.ordered)).times(l.price)),
      new Decimal(0),
    )
    .toNumber();
}
export function resolveEta(
  events: {
    estimatedAt: string;
    observedAt: string;
    cancelled?: boolean;
    revision: number;
  }[],
) {
  return (
    [...events]
      .filter((e) => !e.cancelled)
      .sort(
        (a, b) =>
          b.revision - a.revision || b.observedAt.localeCompare(a.observedAt),
      )[0] || null
  );
}
export function requiredMaterials(
  productId: string,
  units: number,
  components: {
    parent: string;
    component: string;
    quantity: number;
    yield: number;
  }[],
  path: string[] = [],
): Record<string, number> {
  if (path.includes(productId)) throw new Error("BOM cycle detected");
  const children = components.filter((x) => x.parent === productId);
  if (!children.length) return { [productId]: units };
  const result: Record<string, number> = {};
  for (const row of children) {
    if (row.yield <= 0 || row.yield > 1) throw new Error("Invalid BOM yield");
    const sub = requiredMaterials(
      row.component,
      (units * row.quantity) / row.yield,
      components,
      [...path, productId],
    );
    for (const [key, val] of Object.entries(sub))
      result[key] = (result[key] || 0) + val;
  }
  return result;
}
export function addDays(date: string | Date, days: number) {
  return new Date(new Date(date).getTime() + days * 86400000).toISOString();
}
export function assertCurrentRun(expected: string, actual: string) {
  if (expected !== actual)
    throw Object.assign(
      new Error("This demo has ended. Open the current workspace."),
      { statusCode: 409 },
    );
}
