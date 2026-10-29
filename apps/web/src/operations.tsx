import { useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownToLine,
  Ship,
  Clock,
  TriangleAlert,
  ShieldCheck,
  Search,
  ChevronLeft,
  ChevronRight,
  Truck,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace, useEndpoint, useCommand } from "./workspace";
import {
  Badge,
  Card,
  CaseRows,
  Empty,
  ErrorPanel,
  Facts,
  Loading,
  Metric,
  Modal,
  PageTitle,
  RouteMap,
  StockChart,
} from "./components";
import { date, time, human, money, number, API_BASE } from "./api";
export function Overview() {
  const { data, go } = useWorkspace();
  const c = data.cases.filter((c: any) => c.state !== "resolved");
  const focus = c.find((c: any) => c.kind === "stock_gap") || c[0];
  return (
    <>
      <PageTitle
        title={"Good morning, " + data.user.name.split(" ")[0]}
        description="A clear view of what matters. A next step for every exception."
      >
        <span className="date-pill">
          <Clock size={15} />
          {date(data.run.business_at)} · {time(data.run.business_at)} UTC
        </span>
        <button onClick={() => go("/demo")} className="primary">
          Demo studio
          <ArrowUpRight size={16} />
        </button>
      </PageTitle>
      <div className="metrics">
        <Metric
          label="Shipments in motion"
          value={number(data.stats.activeShipments)}
          detail={`${data.stats.shipments} tracked shipments · EMEA`}
          icon={Ship}
        />
        <Metric
          label="Open exceptions"
          value={data.stats.cases}
          detail={`${data.stats.critical} require critical attention`}
          tone="critical"
          icon={TriangleAlert}
        />
        <Metric
          label="Order value exposed"
          value={money(data.stats.exposure)}
          detail="Linked customer lines · estimated"
          tone="high"
          icon={ArrowUpRight}
        />
        <Metric
          label="Risks resolved"
          value={data.stats.resolved}
          detail="Explicit decisions or receipt evidence"
          icon={ShieldCheck}
        />
      </div>
      <div className="overview-grid">
        <Card
          title="Your priority queue"
          sub="A focused list. The most consequential issues first."
          action={
            <button className="text-button" onClick={() => go("/cases")}>
              All cases
              <ArrowRight size={15} />
            </button>
          }
        >
          <CaseRows items={c.slice(0, 6)} onOpen={(id) => go("/cases/" + id)} />
          <div className="card-foot">
            <span>{c.length} active cases across EMEA</span>
            <span>
              <i className="dot teal" />
              Updated from the current demo run
            </span>
          </div>
        </Card>
        <Card
          className="daily-brief"
          title="Your response brief"
          action={<span className="agent-mark small">✦</span>}
        >
          <span className="eyebrow">NEXT BEST ACTION</span>
          <h3>{focus?.title || "Every risk has a response."}</h3>
          <p>
            {focus?.summary || "There are no open cases in this workspace."}
          </p>
          {focus && (
            <>
              <Facts
                items={[
                  ["Shipment", focus.shipment_reference],
                  ["Destination", focus.city],
                  ["Accountable owner", focus.owner_name],
                ]}
              />
              <div className="brief-callout">
                <span className="dot critical" />
                <p>{focus.next_action}</p>
              </div>
              <button
                className="primary full"
                onClick={() => go("/cases/" + focus.id)}
              >
                Open response workspace
                <ArrowRight size={16} />
              </button>
            </>
          )}
          <small className="brief-disclosure">
            Based on recorded evidence · synthetic demo data
          </small>
        </Card>
      </div>
      <div className="overview-bottom">
        <Card
          title="Across the EMEA network"
          sub="Select a destination to inspect a shipment."
          action={<Badge tone="teal">8 destination DCs</Badge>}
        >
          <RouteMap
            shipments={data.shipments}
            onOpen={(id) => go("/shipments?shipment=" + id)}
          />
        </Card>
        <Card
          title="Latest activity"
          sub="The shared record of decisions and outcomes"
        >
          <div className="activity-list">
            {data.activity.slice(0, 5).map((e: any) => (
              <button key={e.id} onClick={() => go("/cases/" + e.case_id)}>
                <span className="activity-icon">
                  <Clock size={15} />
                </span>
                <div>
                  <strong>{e.title}</strong>
                  <small>
                    {e.reference} · {e.actor}
                  </small>
                </div>
                <time>{time(e.business_at)}</time>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
export function Shipments() {
  const { data, go } = useWorkspace();
  const command = useCommand();
  const [search, setSearch] = useState(""),
    [country, setCountry] = useState(""),
    [state, setState] = useState(""),
    [page, setPage] = useState(0),
    [selected, setSelected] = useState<string | null>(
      new URLSearchParams(window.location.search).get("shipment"),
    ),
    [exporting, setExporting] = useState(false);
  const filtered = data.shipments.filter(
    (s: any) =>
      (!country || s.country === country) &&
      (!state || s.status === state) &&
      JSON.stringify([
        s.reference,
        s.product_name,
        s.product_code,
        s.provider,
        s.city,
        s.vessel,
      ])
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const shown = filtered.slice(page * 15, page * 15 + 15);
  async function download(format: string) {
    setExporting(true);
    try {
      const r = await command("/exports", {
        format,
        kind: "shipments",
        search,
        country,
        state,
      });
      const token = localStorage.getItem("baxter-token");
      const res = await fetch(API_BASE + r.url, {
        credentials: "include",
        headers: token ? { Authorization: "Bearer " + token } : {},
      });
      if (!res.ok) throw new Error("Download failed");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "baxter-demo-shipments." + format;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${r.rows} shipments exported`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <>
      <PageTitle
        title="Shipments, in context"
        description="Follow the journey from origin to usable receipt."
      >
        <button disabled={exporting} onClick={() => download("csv")}>
          <ArrowDownToLine size={16} />
          CSV
        </button>
        <button disabled={exporting} onClick={() => download("xlsx")}>
          <ArrowDownToLine size={16} />
          Excel
        </button>
      </PageTitle>
      <div className="toolbar">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Search shipments"
            placeholder="Shipment, SKU, provider, destination…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div className="filters">
          <select
            aria-label="Country filter"
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All countries</option>
            {[...new Set<string>(data.shipments.map((s: any) => s.country))]
              .sort()
              .map((c) => (
                <option key={c}>{c}</option>
              ))}
          </select>
          <select
            aria-label="Shipment status filter"
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setPage(0);
            }}
          >
            <option value="">All statuses</option>
            {["booked", "in_transit", "delivered"].map((v) => (
              <option value={v} key={v}>
                {human(v)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Card>
        <div className="table-wrap">
          <table className="shipment-table">
            <thead>
              <tr>
                <th>Shipment / product</th>
                <th>Route</th>
                <th>Provider</th>
                <th>Baseline</th>
                <th>Usable receipt</th>
                <th>Drift</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((s: any) => (
                <tr key={s.id} onClick={() => setSelected(s.id)}>
                  <td>
                    <button className="table-link">{s.reference}</button>
                    <small>{s.product_code}</small>
                  </td>
                  <td>
                    {s.origin_city}
                    <span className="route-arrow"> → </span>
                    {s.city}
                    <small>
                      {s.origin_country} → {s.country}
                    </small>
                  </td>
                  <td>
                    {s.provider}
                    <small>{s.vessel}</small>
                  </td>
                  <td>{date(s.baseline_eta)}</td>
                  <td>{date(s.usable_eta)}</td>
                  <td>
                    <Badge tone={Number(s.delay_days) > 0 ? "high" : "teal"}>
                      {Number(s.delay_days) > 0
                        ? "+" + Number(s.delay_days) + " days"
                        : "On baseline"}
                    </Badge>
                  </td>
                  <td>{human(s.status)}</td>
                  <td>
                    <ArrowUpRight size={16} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!shown.length && <Empty title="No shipments match" />}
        </div>
        <div className="pagination">
          <span>
            {filtered.length
              ? `${page * 15 + 1}–${Math.min(page * 15 + 15, filtered.length)}`
              : "0"}{" "}
            of {filtered.length} shipments
          </span>
          <div>
            <button
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              aria-label="Next page"
              disabled={(page + 1) * 15 >= filtered.length}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </Card>
      {selected && (
        <ShipmentDrawer id={selected} close={() => setSelected(null)} />
      )}
    </>
  );
}
function ShipmentDrawer({ id, close }: { id: string; close: () => void }) {
  const q = useEndpoint("/shipments/" + id);
  const { go } = useWorkspace();
  return (
    <Modal
      title={q.data?.shipment.reference || "Shipment details"}
      description="Latest estimates, original baseline, and source milestones."
      open
      onClose={close}
    >
      {q.isPending ? (
        <Loading />
      ) : q.error ? (
        <ErrorPanel error={q.error} />
      ) : (
        <>
          <Badge tone="teal">{human(q.data.shipment.status)}</Badge>
          <Facts
            items={[
              [
                "Route",
                q.data.shipment.origin_city + " → " + q.data.shipment.city,
              ],
              ["Product", q.data.shipment.product_name],
              ["Quantity", number(q.data.shipment.quantity) + " units"],
              ["Provider", q.data.shipment.provider],
              ["Port ETA", date(q.data.shipment.port_eta)],
              ["Delivery ETA", date(q.data.shipment.delivery_eta)],
              ["Usable receipt", date(q.data.shipment.usable_eta)],
              ["Original baseline", date(q.data.shipment.baseline_eta)],
            ]}
          />
          <h3>Containers & references</h3>
          <div className="chips">
            {q.data.containers.map((c: any) => (
              <Badge key={c.id}>{c.reference}</Badge>
            ))}
            {q.data.references.map((r: any) => (
              <Badge key={r.id}>{r.value}</Badge>
            ))}
          </div>
          <h3>Shipment evidence</h3>
          <div className="timeline compact-timeline">
            {q.data.milestones.map((m: any) => (
              <div key={m.id}>
                <span className="timeline-dot" />
                <small>
                  {date(m.occurred_at)} ·{" "}
                  {m.cancelled ? "Cancelled" : m.qualifier}
                </small>
                <h3>{human(m.kind)}</h3>
              </div>
            ))}
          </div>
          {q.data.cases.map((c: any) => (
            <button
              key={c.id}
              className="full"
              onClick={() => {
                close();
                go("/cases/" + c.id);
              }}
            >
              {c.title}
              <ArrowRight size={16} />
            </button>
          ))}
        </>
      )}
    </Modal>
  );
}
export function Customs() {
  const q = useEndpoint("/customs");
  const command = useCommand();
  const [filter, setFilter] = useState("all"),
    [selected, setSelected] = useState<any>(null),
    [evidence, setEvidence] = useState(""),
    [busy, setBusy] = useState(false);
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorPanel error={q.error} />;
  const items = q.data.items.filter(
    (c: any) => filter === "all" || filter === c.status,
  );
  return (
    <>
      <PageTitle
        title="Clearance & free time"
        description="Arrival, customs start, clearance and final delivery remain distinct."
      />
      <div className="metrics three">
        <Metric
          label="Customs records"
          value={q.data.items.length}
          detail="Inbound shipments with clearance tracking"
          icon={FileText}
        />
        <Metric
          label="Document gaps"
          value={
            q.data.items.filter((i: any) => i.status === "documents_missing")
              .length
          }
          detail="An explicit document request is needed"
          tone="high"
          icon={TriangleAlert}
        />
        <Metric
          label="Calculated charge exposure"
          value={money(
            q.data.calculations.reduce(
              (n: number, c: any) => n + Number(c.amount),
              0,
            ),
          )}
          detail="Contract-based estimates · not invoiced actuals"
          tone="critical"
          icon={Clock}
        />
      </div>
      {q.data.calculations.length > 0 && (
        <Card title="Charge calculation evidence">
          <div className="padded">
            {q.data.calculations.map((c: any) => (
              <div className="calculation" key={c.id}>
                <strong>
                  {c.reference} · {money(c.amount)}
                </strong>
                <p>
                  {c.units} containers · {c.charge_days} chargeable calendar
                  days
                </p>
                <div className="chips">
                  {c.breakdown.map((b: any, i: number) => (
                    <Badge key={i}>
                      {b.days} days × {money(b.rate)} × {b.containers} ={" "}
                      {money(b.amount)}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      <div className="toolbar">
        <div className="tabs">
          {[
            "all",
            "documents_missing",
            "awaiting_arrival",
            "in_progress",
            "cleared",
          ].map((s) => (
            <button
              key={s}
              className={filter === s ? "selected" : ""}
              onClick={() => setFilter(s)}
            >
              {human(s)}
            </button>
          ))}
        </div>
      </div>
      <Card>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Shipment</th>
                <th>Arrival</th>
                <th>Customs start</th>
                <th>Clearance</th>
                <th>Free until</th>
                <th>Responsible</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c: any) => (
                <tr key={c.id} onClick={() => setSelected(c)}>
                  <td>
                    <button className="table-link">{c.reference}</button>
                    <small>{c.city}</small>
                  </td>
                  <td>{date(c.arrival_at)}</td>
                  <td>{date(c.started_at)}</td>
                  <td>{date(c.cleared_at)}</td>
                  <td>{date(c.free_until)}</td>
                  <td>{c.broker}</td>
                  <td>
                    <Badge
                      tone={
                        c.status === "cleared"
                          ? "teal"
                          : c.status === "documents_missing"
                            ? "high"
                            : "neutral"
                      }
                    >
                      {human(c.status)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal
        title="Clearance evidence"
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setEvidence("");
        }}
        description={selected?.reference}
      >
        {selected && (
          <>
            <Facts
              items={[
                ["Arrival", date(selected.arrival_at)],
                ["Customs started", date(selected.started_at)],
                ["Cleared", date(selected.cleared_at)],
                ["Cause", selected.cause || "No recorded cause"],
              ]}
            />
            {selected.requirements?.map((r: any) => (
              <div className="document" key={r.id}>
                <FileText size={20} />
                <strong>{r.name}</strong>
                <Badge tone={r.status === "missing" ? "high" : "teal"}>
                  {r.status}
                </Badge>
              </div>
            ))}
            {selected.status !== "cleared" && (
              <>
                <label>
                  Simulated broker clearance evidence
                  <textarea
                    rows={3}
                    value={evidence}
                    onChange={(e) => setEvidence(e.target.value)}
                    placeholder="Describe the clearance confirmation…"
                  />
                </label>
                <div className="modal-actions">
                  <button
                    disabled={evidence.length < 15 || busy}
                    className="primary"
                    onClick={async () => {
                      setBusy(true);
                      try {
                        const r = await command(
                          "/customs/" + selected.id + "/clear",
                          { evidence },
                        );
                        toast.success(r.message);
                        setSelected(null);
                        setEvidence("");
                      } catch (e: any) {
                        toast.error(e.message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Record simulated clearance
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
export function Inventory() {
  const q = useEndpoint("/inventory");
  const { data, go } = useWorkspace();
  const [search, setSearch] = useState(""),
    [site, setSite] = useState("");
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorPanel error={q.error} />;
  const { impact, positions, inbound } = q.data;
  const filtered = positions.filter(
    (p: any) =>
      (!site || p.city === site) &&
      JSON.stringify([p.code, p.product])
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const c = data.cases.find(
    (c: any) => c.kind === "stock_gap" && c.state !== "resolved",
  );
  return (
    <>
      <PageTitle
        title="Protect stock availability"
        description="Connect shipment timing to demand, customer exposure, and a feasible recovery."
      >
        {c && (
          <button className="primary" onClick={() => go("/cases/" + c.id)}>
            Open recovery case
            <ArrowRight size={16} />
          </button>
        )}
      </PageTitle>
      <div className="inventory-grid">
        <Card
          title="Lyon · Infusion set"
          sub="DEMO-FG-021 · 12-day horizon · forecast includes firm orders"
        >
          {impact.available ? (
            <>
              <StockChart impact={impact} />
              <div className="impact-strip">
                <div>
                  <strong>{impact.gapDays} days</strong>
                  <small>Stock gap</small>
                </div>
                <div>
                  <strong>{number(impact.shortageUnits)}</strong>
                  <small>Unfulfilled units</small>
                </div>
                <div>
                  <strong>{money(impact.orderExposure)}</strong>
                  <small>Order exposure</small>
                </div>
              </div>
            </>
          ) : (
            <Empty title="Insufficient data">{impact.reason}</Empty>
          )}
        </Card>
        <Card title="Recovery feasibility" sub="Released stock only">
          <Facts
            items={[
              ["Alternate DC", impact.donor?.city || "Unavailable"],
              ["Stock on hand", number(impact.donor?.quantity)],
              ["Reserved", number(impact.donor?.reserved)],
              ["Available after protection", number(impact.donor?.available)],
            ]}
          />
          <div className="padded">
            <h3>Inbound plans</h3>
            {inbound.map((p: any) => (
              <div className="document" key={p.id}>
                <Truck size={20} />
                <div>
                  <strong>
                    {number(p.quantity)} units · {human(p.kind)}
                  </strong>
                  <small>
                    {p.city} · usable {date(p.usable_at)}
                  </small>
                </div>
                <Badge tone={p.status === "received" ? "teal" : "neutral"}>
                  {p.status}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="toolbar">
        <input
          aria-label="Search inventory"
          placeholder="Find a SKU…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={site}
          aria-label="Inventory site"
          onChange={(e) => setSite(e.target.value)}
        >
          <option value="">All distribution centres</option>
          {[...new Set<string>(positions.map((p: any) => p.city))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <Card
        title={`${filtered.length} stock positions`}
        sub="Current seed snapshot · quantities in units"
      >
        <div className="table-wrap max-table">
          <table>
            <thead>
              <tr>
                <th>SKU / product</th>
                <th>DC</th>
                <th>On hand</th>
                <th>Reserved</th>
                <th>Unreserved</th>
                <th>Quality</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p: any) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.code}</strong>
                    <small>{p.product}</small>
                  </td>
                  <td>{p.city}</td>
                  <td>{number(p.quantity)}</td>
                  <td>{number(p.reserved)}</td>
                  <td>{number(Number(p.quantity) - Number(p.reserved))}</td>
                  <td>
                    <Badge tone="teal">{p.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
