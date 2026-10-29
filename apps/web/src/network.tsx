import { useMemo, useState } from "react";
import { ReactFlow, Background, Controls, MarkerType } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowRight,
  Network as NetworkIcon,
  ShieldCheck,
  TriangleAlert,
  GitBranch,
} from "lucide-react";
import { toast } from "sonner";
import { useEndpoint, useCommand } from "./workspace";
import {
  Badge,
  Card,
  Empty,
  ErrorPanel,
  Loading,
  Metric,
  PageTitle,
} from "./components";
import { human, money, number, date } from "./api";
export function Network() {
  const q = useEndpoint("/network");
  const command = useCommand();
  const [product, setProduct] = useState(""),
    [kind, setKind] = useState("supplier"),
    [days, setDays] = useState(7),
    [tariff, setTariff] = useState(10),
    [country, setCountry] = useState("FR"),
    [supplierId, setSupplierId] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<any>(null);
  const graph = useMemo(() => {
    if (!q.data) return { nodes: [], edges: [] };
    const root =
      product || q.data.products.find((p: any) => p.code === "DEMO-FG-021")?.id;
    const depths = new Map<string, number>([[root, 0]]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of q.data.components)
        if (depths.has(c.parent_id) && !depths.has(c.component_id)) {
          depths.set(c.component_id, depths.get(c.parent_id)! + 1);
          changed = true;
        }
    }
    const at: Record<number, number> = {};
    return {
      nodes: [...depths.entries()].map(([id, depth]) => {
        const p = q.data.products.find((p: any) => p.id === id);
        const index = at[depth] || 0;
        at[depth] = index + 1;
        const source = q.data.sources.filter(
          (s: any) => s.product_id === id && s.active && s.approved,
        );
        return {
          id,
          position: { x: depth * 280, y: index * 140 + 30 },
          data: {
            label: (
              <div className="bom-label">
                <span>
                  {p?.kind} · {p?.code}
                </span>
                <strong>{p?.name}</strong>
                <small>
                  {source.length} approved active source
                  {source.length === 1 ? "" : "s"}
                </small>
              </div>
            ),
          },
          style: {
            width: 240,
            borderColor: source.length === 1 ? "#d4b68f" : "#b8d9d0",
            borderRadius: 10,
            background: depth === 0 ? "#edf7f3" : "#fff",
          },
        };
      }),
      edges: q.data.components
        .filter(
          (c: any) => depths.has(c.parent_id) && depths.has(c.component_id),
        )
        .map((c: any) => ({
          id: c.id,
          source: c.parent_id,
          target: c.component_id,
          label: `${c.quantity} / yield ${Number(c.yield_factor) * 100}%`,
          markerEnd: { type: MarkerType.ArrowClosed, color: "#7aa29a" },
          style: { stroke: "#7aa29a" },
          labelStyle: { fontSize: 10, fill: "#657780" },
        })),
    };
  }, [q.data, product]);
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorPanel error={q.error} />;
  const suppliers = [
    ...new Map<string, any>(
      q.data.sources.map((s: any) => [s.supplier_id, s]),
    ).values(),
  ];
  return (
    <>
      <PageTitle
        title="Understand the ripple effect"
        description="Trace a disruption through sourcing and the bill of materials before choosing a response."
      />
      <Card
        title="Product dependency map"
        sub="Multi-level BOM · source approval and capacity remain explicit"
        action={
          <select
            aria-label="BOM product"
            value={
              product ||
              q.data.products.find((p: any) => p.code === "DEMO-FG-021")?.id
            }
            onChange={(e) => setProduct(e.target.value)}
          >
            {q.data.products
              .filter((p: any) => p.kind === "FG")
              .map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.code} · {p.name}
                </option>
              ))}
          </select>
        }
      >
        <div className="network-canvas">
          <ReactFlow
            key={product}
            nodes={graph.nodes}
            edges={graph.edges}
            fitView
            minZoom={0.3}
            maxZoom={1.7}
            nodesDraggable={false}
            nodesConnectable={false}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#cedbdc" gap={20} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </Card>
      <div className="scenario-grid">
        <Card
          title="Explore a disruption"
          sub="A saved what-if scenario; the operational baseline is preserved."
        >
          <form
            className="padded scenario-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                const r = await command("/network-scenarios", {
                  kind,
                  days,
                  tariff,
                  country,
                  ...(supplierId ? { supplierId } : {}),
                });
                setResult(r);
                toast.success("Scenario calculated and saved");
              } catch (e: any) {
                toast.error(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Disruption type
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="supplier">Supplier interruption</option>
                <option value="route">Route delay</option>
                <option value="tariff">Hypothetical tariff</option>
              </select>
            </label>
            {kind === "supplier" ? (
              <label>
                Supplier
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  <option value="">Default material partner</option>
                  {suppliers.map((s) => (
                    <option value={s.supplier_id} key={s.supplier_id}>
                      {s.supplier}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Destination country
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {["FR", "NL", "DE", "IT", "ES", "GB", "PL", "AE"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            )}
            <div className="form-row">
              <label>
                Disruption days
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                />
              </label>
              {kind === "tariff" && (
                <label>
                  Hypothetical rate (%)
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={tariff}
                    onChange={(e) => setTariff(Number(e.target.value))}
                  />
                </label>
              )}
            </div>
            <button className="primary full" disabled={busy}>
              {busy ? "Calculating…" : "Run scenario"}
              <ArrowRight size={17} />
            </button>
            <p className="muted small-copy">
              Scenario cost assumptions are illustrative. Rates are not live
              tariff guidance.
            </p>
          </form>
        </Card>
        <Card
          title="Scenario results"
          sub="Assess exposure and approved alternatives"
        >
          {result ? (
            <ScenarioResult result={result} />
          ) : q.data.scenarios.length ? (
            <ScenarioResult result={q.data.scenarios[0].result} />
          ) : (
            <Empty title="Start with a what-if">
              Choose a supplier, route or tariff change to see the linked
              impact.
            </Empty>
          )}
        </Card>
      </div>
      {q.data.scenarios.length > 0 && (
        <Card title="Saved comparisons">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Created</th>
                  <th>Products</th>
                  <th>Shipments</th>
                  <th>Exposed order value</th>
                  <th>Assumed incremental cost</th>
                </tr>
              </thead>
              <tbody>
                {q.data.scenarios.map((s: any) => (
                  <tr key={s.id} onClick={() => setResult(s.result)}>
                    <td>
                      <button className="table-link">{s.name}</button>
                    </td>
                    <td>{date(s.created_at)}</td>
                    <td>{s.result.affectedProducts}</td>
                    <td>{s.result.shipments}</td>
                    <td>{money(s.result.exposedOrderValue)}</td>
                    <td>{money(s.result.incrementalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
function ScenarioResult({ result: r }: { result: any }) {
  return (
    <div className="padded">
      <Badge tone="high">Hypothetical · {human(r.kind)}</Badge>
      <div className="impact-strip">
        <div>
          <strong>{r.affectedProducts}</strong>
          <small>Products connected</small>
        </div>
        <div>
          <strong>{r.shipments}</strong>
          <small>Active shipments</small>
        </div>
        <div>
          <strong>{money(r.exposedOrderValue)}</strong>
          <small>Order value in scope</small>
        </div>
      </div>
      <div className="scenario-cost">
        <span>Illustrative incremental cost</span>
        <strong>{money(r.incrementalCost)}</strong>
      </div>
      <h3>Approved, active alternatives</h3>
      {r.alternativeSources?.length ? (
        <div className="alternatives">
          {r.alternativeSources.slice(0, 8).map((a: any, i: number) => (
            <div key={i}>
              <strong>{a.supplier}</strong>
              <small>{a.product}</small>
              <span>
                {number(a.capacity)} capacity · {a.leadDays} days ·{" "}
                {money(a.cost)}/unit
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">
          No alternative source in scope meets the approval and active-capacity
          filters.
        </p>
      )}
      <ul className="assumptions">
        {r.assumptions?.map((a: string) => (
          <li key={a}>{a}</li>
        ))}
      </ul>
    </div>
  );
}
export function Partners() {
  const q = useEndpoint("/partners");
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorPanel error={q.error} />;
  return (
    <>
      <PageTitle
        title="Partner performance"
        description="A common, transparent view across provider formats and operating teams."
      />
      <div className="notice">
        <ShieldCheck size={19} />
        <span>
          Same synthetic shipment cohort for every provider. ETA drift is a
          planning metric; delivery performance requires actual receipt
          evidence.
        </span>
      </div>
      <div className="partner-grid">
        {q.data.map((p: any, i: number) => (
          <Card key={p.id}>
            <div className="partner-head">
              <span className="partner-logo">
                {p.name
                  .split(" ")
                  .map((s: string) => s[0])
                  .join("")}
              </span>
              <div>
                <h2>{p.name}</h2>
                <small>Demo logistics provider · EMEA</small>
              </div>
            </div>
            <div className="partner-metrics">
              <div>
                <strong>{p.shipments}</strong>
                <small>Tracked shipments</small>
              </div>
              <div>
                <strong>{p.open_cases}</strong>
                <small>Open cases</small>
              </div>
              <div>
                <strong>{p.avg_delay_days}d</strong>
                <small>Mean positive ETA drift</small>
              </div>
            </div>
            <div className="partner-bar">
              <span
                style={{ width: (p.delivered / p.shipments) * 100 + "%" }}
              />
            </div>
            <div className="card-foot">
              <span>
                {p.delivered} delivered / {p.shipments} tracked
              </span>
              <span>{p.replies} recorded replies</span>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
export function DataQuality() {
  const q = useEndpoint("/data-quality");
  const command = useCommand();
  const [selected, setSelected] = useState<any>(null),
    [resolution, setResolution] = useState(""),
    [matchId, setMatchId] = useState(""),
    [busy, setBusy] = useState(false);
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorPanel error={q.error} />;
  return (
    <>
      <PageTitle
        title="Trust the evidence"
        description="Resolve source conflicts and missing context before they drive decisions."
      />
      <div className="integration-grid">
        {q.data.connections.map((c: any) => (
          <div className="integration-tile" key={c.id}>
            <div>
              <strong>{c.name}</strong>
              <Badge tone={c.status === "healthy" ? "teal" : "high"}>
                {c.status}
              </Badge>
            </div>
            <p>
              Last fixture update {date(c.last_success_at)} · {c.mode}
            </p>
          </div>
        ))}
      </div>
      <Card
        title="Data review queue"
        sub="Cancelled revisions stay in the audit trail and do not change the current estimate."
      >
        <div className="padded">
          {q.data.issues.map((i: any) => (
            <div className="quality-issue" key={i.id}>
              <span className={"metric-icon " + i.severity}>
                <TriangleAlert size={20} />
              </span>
              <div>
                <h3>{i.title}</h3>
                <p>{i.detail}</p>
                <small>
                  {i.reference} · {human(i.kind)}
                </small>
              </div>
              <Badge tone={i.status === "resolved" ? "teal" : i.severity}>
                {i.status}
              </Badge>
              {i.status !== "resolved" && (
                <button
                  onClick={() => {
                    setSelected(i);
                    setResolution("");
                    setMatchId("");
                  }}
                >
                  Review
                  <ArrowRight size={16} />
                </button>
              )}
            </div>
          ))}
        </div>
      </Card>
      {selected && (
        <div className="modal-overlay inline-overlay">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quality-title"
          >
            <div className="modal-head">
              <div>
                <h2 id="quality-title">{selected.title}</h2>
                <p>Record the evidence behind your decision.</p>
              </div>
              <button onClick={() => setSelected(null)}>Close</button>
            </div>
            <p>{selected.detail}</p>
            {selected.kind === "ambiguous_reference" && (
              <label>
                Validated shipment candidate
                <select
                  value={matchId}
                  onChange={(e) => setMatchId(e.target.value)}
                >
                  <option value="">Select a candidate</option>
                  {q.data.matches
                    .filter(
                      (m: any) => m.reference_id === selected.reference_id,
                    )
                    .map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.reference} · {m.value}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label>
              Resolution evidence
              <textarea
                rows={4}
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="What confirms this interpretation?"
              />
            </label>
            <div className="modal-actions">
              <button
                className="primary"
                disabled={
                  busy ||
                  resolution.length < 15 ||
                  (selected.kind === "ambiguous_reference" && !matchId)
                }
                onClick={async () => {
                  setBusy(true);
                  try {
                    await command("/data-quality/" + selected.id + "/resolve", {
                      resolution,
                      ...(matchId ? { matchId } : {}),
                    });
                    toast.success("Review recorded");
                    setSelected(null);
                  } catch (e: any) {
                    toast.error(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Record decision
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
