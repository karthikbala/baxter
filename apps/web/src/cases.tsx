import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Mail,
  Users,
  Truck,
  Flag,
  FileText,
  Clock,
  ExternalLink,
  ShieldCheck,
  Ship,
} from "lucide-react";
import { toast } from "sonner";
import { useEndpoint, useWorkspace, useCommand } from "./workspace";
import {
  Badge,
  Card,
  CaseRows,
  Empty,
  ErrorPanel,
  Facts,
  Loading,
  Modal,
  PageTitle,
  StockChart,
} from "./components";
import { date, time, human, money, number } from "./api";
import { Assistant } from "./assistant";
export function ActionReview({
  action,
  onClose,
}: {
  action: any;
  onClose: () => void;
}) {
  const command = useCommand();
  const [busy, setBusy] = useState(false);
  const a = action?.action || action;
  return (
    <Modal
      open={!!a}
      onClose={onClose}
      title={a?.title || "Review action"}
      description="A versioned approval will be recorded with the exact action below."
    >
      {a && (
        <>
          <Badge tone="teal">Simulated business action</Badge>
          <Facts
            items={[
              ["Action", human(a.kind)],
              [
                "Recipient / destination",
                a.payload?.recipient || a.payload?.donorName || "Case owner",
              ],
              ...(a.payload?.quantity
                ? ([
                    ["Quantity", number(a.payload.quantity)],
                    ["Estimated cost", money(a.payload.cost)],
                  ] as [string, any][])
                : []),
            ]}
          />
          <div className="review-body">
            {a.payload?.subject && <strong>{a.payload.subject}</strong>}
            <p>{a.payload?.body}</p>
          </div>
          <div className="notice">
            <ShieldCheck size={18} />
            <span>
              {a.kind === "transfer"
                ? "Approving creates a planned transfer. Receipt evidence is still required to close the risk."
                : "This demo records the action and follow-up. Partner email delivery is simulated."}
            </span>
          </div>
          <div className="modal-actions">
            <button onClick={onClose}>Cancel</button>
            <button
              className="primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const r = await command("/actions/" + a.id + "/execute", {
                    version: a.version,
                  });
                  toast.success(
                    r.result?.message || "Action already completed",
                  );
                  onClose();
                } catch (e: any) {
                  toast.error(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Recording…" : "Approve & record"}
              <ArrowRight size={16} />
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
export function Cases() {
  const { data, go } = useWorkspace();
  const [filter, setFilter] = useState("open"),
    [search, setSearch] = useState("");
  const items = data.cases.filter(
    (c: any) =>
      (filter === "all" ||
        (filter === "open" && c.state !== "resolved") ||
        filter === c.severity ||
        filter === c.state) &&
      JSON.stringify([c.title, c.shipment_reference, c.city])
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        title="Your action centre"
        description="Prioritised by impact, with an owner and a next step."
      />
      <div className="toolbar">
        <div className="tabs">
          {["open", "critical", "waiting", "resolved", "all"].map((f) => (
            <button
              className={filter === f ? "selected" : ""}
              key={f}
              onClick={() => setFilter(f)}
            >
              {human(f)}
            </button>
          ))}
        </div>
        <input
          aria-label="Search cases"
          placeholder="Find a case or shipment…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <Card
        title={`${items.length} cases`}
        sub="Order exposure is an estimate, not realised loss."
      >
        <CaseRows items={items} onOpen={(id) => go("/cases/" + id)} />
      </Card>
    </>
  );
}
export function CaseDetail({ id }: { id: string }) {
  const { data, go } = useWorkspace();
  const query = useEndpoint("/cases/" + id);
  const command = useCommand();
  const [action, setAction] = useState<any>(null),
    [tab, setTab] = useState("timeline"),
    [busy, setBusy] = useState(""),
    [resolve, setResolve] = useState(false),
    [reason, setReason] = useState("");
  if (query.isPending) return <Loading />;
  if (query.error)
    return <ErrorPanel error={query.error} retry={() => query.refetch()} />;
  const {
    case: c,
    shipment: s,
    events,
    impact,
    milestones,
    communications,
    actions,
    references,
    documents,
  } = query.data;
  async function propose(kind: string, options: any = {}) {
    setBusy(kind);
    try {
      setAction(
        await command("/cases/" + id + "/actions", { kind, ...options }),
      );
      setResolve(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy("");
    }
  }
  const oldRun = new URLSearchParams(location.search).get("run");
  const stale = oldRun && oldRun !== data.run.id;
  return (
    <>
      <button className="back" onClick={() => go("/cases")}>
        <ArrowLeft size={16} />
        All cases
      </button>
      <PageTitle
        eyebrow={c.reference + " · " + c.shipment_reference}
        title={c.title}
        description={c.city + " · " + c.provider}
      >
        {
          <Badge tone={c.state === "resolved" ? "teal" : c.severity}>
            {human(c.state)} · {c.severity}
          </Badge>
        }
      </PageTitle>
      {stale && (
        <div className="error-panel">
          This notification belongs to an ended demo. Open the current action
          centre.
        </div>
      )}
      <div className="case-detail-grid">
        <div className="case-work">
          <Card
            className="response-brief"
            title="The situation"
            action={<Badge tone="neutral">Evidence-led</Badge>}
          >
            <p className="lead">{c.summary}</p>
            <Facts
              items={[
                ["Accountable owner", c.owner_name],
                ["Next step", c.next_action],
                ["Usable receipt", date(s.usable_eta)],
                ["Baseline receipt", date(s.baseline_eta)],
                ["Order value exposed", money(c.exposure)],
                ["Response due (UTC)", date(c.due_at) + " · " + time(c.due_at)],
              ]}
            />
            {c.state !== "resolved" && !stale && (
              <div className="action-bar">
                <button
                  className="primary"
                  disabled={!!c.acknowledged_at}
                  onClick={async () => {
                    try {
                      await command("/cases/" + id + "/acknowledge");
                      toast.success("Acknowledged. The risk remains open.");
                    } catch (e: any) {
                      toast.error(e.message);
                    }
                  }}
                >
                  <Check size={16} />
                  {c.acknowledged_at ? "Acknowledged" : "I’ll take this"}
                </button>
                <button disabled={!!busy} onClick={() => propose("followup")}>
                  <Mail size={16} />
                  Follow up
                </button>
                <button disabled={!!busy} onClick={() => propose("escalate")}>
                  <Flag size={16} />
                  Escalate
                </button>
                <button disabled={!!busy} onClick={() => propose("assign")}>
                  <Users size={16} />
                  Assign planner
                </button>
              </div>
            )}
          </Card>
          {impact?.available && (
            <Card
              title="Stock impact & recovery"
              sub={`${number(impact.initialStock)} units available at D+0 · ${number(impact.dailyDemand)} units daily demand`}
            >
              <StockChart impact={impact} />
              <div className="impact-strip">
                <div>
                  <strong>{impact.gapDays} days</strong>
                  <small>Projected stock gap</small>
                </div>
                <div>
                  <strong>{number(impact.shortageUnits)}</strong>
                  <small>Units unfulfilled</small>
                </div>
                <div>
                  <strong>{money(impact.orderExposure)}</strong>
                  <small>Orders exposed</small>
                </div>
              </div>
              {c.state !== "resolved" && (
                <div className="recovery-option">
                  <span className="metric-icon teal">
                    <Truck size={21} />
                  </span>
                  <div>
                    <strong>Bridge the gap from Utrecht</strong>
                    <p>
                      {number(impact.donor?.available)} units available after
                      commitments and protection. Proposed 3,000 units · D+5 ·
                      €1,200.
                    </p>
                  </div>
                  <button
                    className="primary"
                    disabled={!!busy || Number(impact.donor?.available) < 3000}
                    onClick={() => propose("transfer")}
                  >
                    Review transfer
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </Card>
          )}
          <Card>
            <div className="tabs card-tabs">
              {[
                "timeline",
                "milestones",
                "messages",
                "documents",
                "actions",
              ].map((t) => (
                <button
                  className={tab === t ? "selected" : ""}
                  onClick={() => setTab(t)}
                  key={t}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === "timeline" && (
              <div className="timeline">
                {events.map((e: any) => (
                  <div key={e.id}>
                    <span
                      className={
                        "timeline-dot " + (e.kind === "resolved" ? "teal" : "")
                      }
                    />
                    <small>
                      {date(e.business_at)} · {time(e.business_at)} UTC <b>·</b>{" "}
                      {e.actor}
                    </small>
                    <h3>{e.title}</h3>
                    <p>{e.detail}</p>
                  </div>
                ))}
              </div>
            )}
            {tab === "milestones" && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Milestone</th>
                      <th>Evidence</th>
                      <th>Event date</th>
                      <th>Observed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {milestones.map((m: any) => (
                      <tr key={m.id} className={m.cancelled ? "cancelled" : ""}>
                        <td>
                          {human(m.kind)}
                          <small>{m.detail}</small>
                        </td>
                        <td>
                          <Badge
                            tone={
                              m.cancelled
                                ? "high"
                                : m.qualifier === "actual"
                                  ? "teal"
                                  : "neutral"
                            }
                          >
                            {m.cancelled ? "Cancelled" : m.qualifier}
                          </Badge>
                        </td>
                        <td>{date(m.occurred_at)}</td>
                        <td>{date(m.observed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {tab === "messages" &&
              (communications.length ? (
                <div className="message-list">
                  {communications.map((m: any) => (
                    <article key={m.id}>
                      <Badge tone="neutral">{m.direction} · simulated</Badge>
                      <h3>{m.subject}</h3>
                      <small>{m.recipient}</small>
                      <p>{m.body}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty title="No messages yet">
                  Prepare and approve a follow-up to start the response trail.
                </Empty>
              ))}
            {tab === "documents" && (
              <div className="padded">
                <h3>Matched references</h3>
                {references.map((r: any) => (
                  <div className="document" key={r.id}>
                    <FileText size={19} />
                    <div>
                      <strong>{r.value}</strong>
                      <small>
                        {r.issuer} · {r.kind}
                      </small>
                    </div>
                    <Badge tone={r.verified ? "teal" : "high"}>
                      {r.verified ? "Verified" : "Needs review"}
                    </Badge>
                  </div>
                ))}
                {documents.map((d: any) => (
                  <details className="document-content" key={d.id}>
                    <summary>
                      {d.name} · {d.status}
                    </summary>
                    <pre>{d.content}</pre>
                  </details>
                ))}
              </div>
            )}
            {tab === "actions" &&
              (actions.length ? (
                <div className="padded">
                  {actions.map((a: any) => (
                    <div className="document" key={a.id}>
                      <ShieldCheck size={20} />
                      <div>
                        <strong>{a.title}</strong>
                        <small>
                          {human(a.status)} · version {a.version}
                        </small>
                      </div>
                      {a.status === "pending_approval" && (
                        <button onClick={() => setAction(a)}>Review</button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty title="No actions prepared">
                  Every approval and result will appear here.
                </Empty>
              ))}
          </Card>
          {c.state !== "resolved" && (
            <button
              className="text-button muted"
              onClick={() => setResolve(true)}
            >
              Record a resolution with evidence
            </button>
          )}
        </div>
        <Assistant caseId={id} onAction={setAction} />
      </div>
      <ActionReview action={action} onClose={() => setAction(null)} />
      <Modal
        title="Record resolution"
        description="Explain what evidence removes this risk. An acknowledgement or partner reply alone is insufficient."
        open={resolve}
        onClose={() => setResolve(false)}
      >
        <label>
          Decision or receipt evidence
          <textarea
            rows={5}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe the verified outcome…"
          />
        </label>
        <div className="modal-actions">
          <button onClick={() => setResolve(false)}>Cancel</button>
          <button
            className="primary"
            disabled={reason.trim().length < 15 || !!busy}
            onClick={() => propose("resolve", { reason })}
          >
            Review resolution
          </button>
        </div>
      </Modal>
    </>
  );
}
