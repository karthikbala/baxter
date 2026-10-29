import { describe, it, expect } from "vitest";
import {
  stockImpact,
  stockProjection,
  allocateExposure,
  chargeEstimate,
  resolveEta,
  requiredMaterials,
  addDays,
  assertCurrentRun,
} from "../packages/domain/calculations";
describe("shipment business calculations", () => {
  it("maps D+9 receipt to the three-day gap, and the alternate D+5 transfer removes it", () => {
    const impact = stockImpact();
    expect(impact.gapDays).toBe(3);
    expect(impact.shortageUnits).toBe(3000);
    expect(impact.orderExposure).toBe(60000);
    expect(impact.projection.filter((p) => p.unmet).map((p) => p.day)).toEqual([
      6, 7, 8,
    ]);
    expect(stockImpact(9, true).shortageUnits).toBe(0);
    expect(stockImpact(4).shortageUnits).toBe(0);
  });
  it("repays backlog before satisfying new daily demand", () => {
    const p = stockProjection(0, [10, 10, 10], [{ day: 2, quantity: 25 }]);
    expect(p[2]).toMatchObject({
      backlog: 5,
      unmet: 5,
      onHand: 0,
      cumulativeGap: 25,
    });
  });
  it("calculates two-container tiered charges without mixing total and per-unit rates", () => {
    expect(chargeEstimate(3, 2).amount).toBe(700);
    expect(chargeEstimate(0, 2).amount).toBe(0);
    expect(() => chargeEstimate(-1)).toThrow();
  });
  it("caps a shared order line and adds distinct lines only once", () => {
    expect(
      allocateExposure([
        { lineId: "one", ordered: 3000, allocated: 2000, unitPrice: 20 },
        { lineId: "one", ordered: 3000, allocated: 2000, unitPrice: 20 },
        { lineId: "two", ordered: 10, allocated: 10, unitPrice: 10 },
      ]),
    ).toBe(60100);
  });
  it("ignores cancelled high revisions", () => {
    expect(
      resolveEta([
        { revision: 2, observedAt: "2026-09-09", estimatedAt: "2026-09-18" },
        {
          revision: 99,
          observedAt: "2026-09-10",
          estimatedAt: "2026-10-01",
          cancelled: true,
        },
      ])?.revision,
    ).toBe(2);
  });
  it("propagates quantities through multi-level BOM yields and rejects cycles", () => {
    const bom = [
      { parent: "fg", component: "wip", quantity: 2, yield: 1 },
      { parent: "wip", component: "rm", quantity: 1, yield: 0.5 },
    ];
    expect(requiredMaterials("fg", 100, bom)).toEqual({ rm: 400 });
    expect(() =>
      requiredMaterials("fg", 1, [
        ...bom,
        { parent: "rm", component: "fg", quantity: 1, yield: 1 },
      ]),
    ).toThrow("cycle");
  });
  it("preserves two-hour deadlines and blocks previous-run actions", () => {
    expect(addDays("2026-09-09T08:00:00Z", 2 / 24)).toBe(
      "2026-09-09T10:00:00.000Z",
    );
    expect(() => assertCurrentRun("old", "new")).toThrow("ended");
  });
});
