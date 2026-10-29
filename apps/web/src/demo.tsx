import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  Clock,
  Headphones,
  Mic,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Smartphone,
  Volume2,
  Wifi,
  Info,
  Power,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace, useEndpoint, useCommand } from "./workspace";
import {
  Badge,
  Card,
  Empty,
  ErrorPanel,
  Facts,
  Loading,
  Modal,
  PageTitle,
} from "./components";
import { date, time, human } from "./api";
import { enrolDevice, native } from "./device";
import { playAlert } from "./voice";
export function Demo() {
  const { data, go } = useWorkspace();
  const q = useEndpoint("/demo/status");
  const command = useCommand();
  const [busy, setBusy] = useState(""),
    [selected, setSelected] = useState(""),
    [result, setResult] = useState<any>(null),
    [reset, setReset] = useState(false),
    [countdown, setCountdown] = useState(0);
  const timer = useRef<any>(null);
  useEffect(() => () => clearInterval(timer.current), []);
  useEffect(() => {
    const t = setInterval(() => q.refetch(), 4000);
    return () => clearInterval(t);
  }, [data.run.id]);
  const currentCase =
    selected ||
    data.cases.find(
      (c: any) => c.kind === "stock_gap" && c.state !== "resolved",
    )?.id ||
    data.cases[0]?.id;
  async function trigger(code: string) {
    setBusy(code);
    try {
      const prior =
        code === "S01"
          ? q.data?.commands.find((c: any) => c.scenario === "S01")
          : null;
      const r = prior
        ? await command("/demo/notify", {
            caseId: prior.result.caseId,
            commandId: crypto.randomUUID(),
          })
        : await command("/demo/trigger", {
            scenario: code,
            commandId: crypto.randomUUID(),
            caseId: currentCase,
          });
      setResult(r);
      toast.success(r.message || "Scenario completed");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy("");
    }
  }
  function delayed() {
    if (countdown) return;
    setCountdown(10);
    let left = 10;
    timer.current = setInterval(() => {
      left--;
      setCountdown(left);
      if (left === 0) {
        clearInterval(timer.current);
        trigger("S01");
      }
    }, 1000);
  }
  if (q.isPending) return <Loading />;
  if (q.error) return <ErrorPanel error={q.error} />;
  return (
    <>
      <PageTitle
        eyebrow="PRESENTER WORKSPACE"
        title="Make the response real"
        description="Steer a repeatable story from disruption to verified recovery."
      >
        <button onClick={() => setReset(true)}>
          <RotateCcw size={16} />
          Reset demo
        </button>
        <button className="primary" onClick={() => go("/profile")}>
          <Smartphone size={16} />
          Connect phone
        </button>
      </PageTitle>
      <div className="demo-hero">
        <div>
          <Badge tone="teal">SCENARIO 01 · THE MEETING MOMENT</Badge>
          <h2>
            A late container.
            <br />A decision before it’s too late.
          </h2>
          <p>
            Shift the usable receipt from D+4 to D+9. The engine calculates the
            stock gap, creates the case, and queues a real push to your enrolled
            phone.
          </p>
          <div className="action-bar">
            <button
              className="primary"
              disabled={!!busy || !!countdown}
              onClick={() => trigger("S01")}
            >
              <Bell size={18} />
              {busy === "S01"
                ? "Invoking…"
                : q.data.commands.some((c: any) => c.scenario === "S01")
                  ? "Send critical alert again"
                  : "Trigger critical alert"}
            </button>
            <button
              className="dark-outline"
              disabled={!!busy}
              onClick={
                countdown
                  ? () => {
                      clearInterval(timer.current);
                      setCountdown(0);
                    }
                  : delayed
              }
            >
              <Clock size={16} />
              {countdown ? `Cancel · ${countdown}s` : "Trigger in 10 seconds"}
            </button>
          </div>
        </div>
        <div className="demo-signal">
          <div className={"signal-rings " + (countdown ? "pulsing" : "")}>
            <Bell size={40} />
            {countdown > 0 && <span>{countdown}</span>}
          </div>
          <p>
            {countdown
              ? "Lock the demo phone now"
              : "Evidence → impact → action"}
          </p>
          <small>Device sound follows platform permissions</small>
        </div>
      </div>
      {result && (
        <div className="result-banner">
          <Check size={20} />
          <span>{result.message}</span>
          {result.caseId && (
            <button onClick={() => go("/cases/" + result.caseId)}>
              Open case
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      )}
      <div className="demo-layout">
        <div>
          <Card
            title="Choose the next chapter"
            sub="Each scenario runs once per reset; repeated clicks return the original result."
          >
            <div className="scenario-list">
              {data.scenarioTemplates
                .filter((s: any) => s.code !== "S01")
                .map((s: any) => (
                  <div key={s.id}>
                    <span className="scenario-number">{s.code.slice(1)}</span>
                    <div>
                      <h3>{s.name}</h3>
                      <p>{s.description}</p>
                      {s.code === "S04" && (
                        <small>
                          Requires an approved follow-up on the selected case.
                        </small>
                      )}
                      {s.code === "S09" && (
                        <small>
                          Requires the alternate stock transfer to be approved.
                        </small>
                      )}
                    </div>
                    <button
                      disabled={!!busy || !!countdown}
                      aria-label={"Run " + s.code + " " + s.name}
                      onClick={() => trigger(s.code)}
                    >
                      {q.data.commands.some(
                        (c: any) => c.scenario === s.code,
                      ) ? (
                        <Check size={17} />
                      ) : (
                        <Play size={17} />
                      )}
                    </button>
                  </div>
                ))}
            </div>
          </Card>
          <Card
            title="Response controls"
            sub="Business time changes; notification expiry uses the real clock."
          >
            <div className="padded">
              <label>
                Case in focus
                <select
                  value={currentCase}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {data.cases
                    .filter((c: any) => c.state !== "resolved")
                    .map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.reference} · {c.title}
                      </option>
                    ))}
                </select>
              </label>
              <div className="action-bar">
                <button
                  disabled={!!busy}
                  onClick={async () => {
                    try {
                      const r = await command("/demo/reply", {
                        caseId: currentCase,
                      });
                      toast.success(r.message);
                    } catch (e: any) {
                      toast.error(e.message);
                    }
                  }}
                >
                  <Send size={16} />
                  Simulate partner reply
                </button>
                <button
                  disabled={!!busy}
                  onClick={async () => {
                    try {
                      const r = await command("/demo/advance", { hours: 2 });
                      toast.success(r.message);
                    } catch (e: any) {
                      toast.error(e.message);
                    }
                  }}
                >
                  <Clock size={16} />
                  Advance 2 hours
                </button>
              </div>
              <p className="small-copy muted">
                A reply records a response. Customs clearance and delivery still
                need physical milestone evidence.
              </p>
            </div>
          </Card>
        </div>
        <div>
          <Card title="Demo readiness">
            <div className="readiness">
              <Status
                label="Application & database"
                ready
                detail="Current authenticated workspace loaded"
              />
              <Status
                label="Notification & escalation worker"
                ready={q.data.capabilities.worker}
                detail={
                  q.data.capabilities.worker
                    ? "Heartbeat received within 15 seconds"
                    : "Worker heartbeat missing; start the worker before the demo"
                }
              />
              <Status
                label="OpenAI agent & voice"
                ready={q.data.capabilities.openai}
                detail="Credentials configured; requests tested independently"
              />
              <Status
                label="Web Push"
                ready={q.data.capabilities.webPush}
                detail="Enroll a device and verify a test notification"
              />
              <Status
                label="Android custom sound"
                ready={q.data.capabilities.nativePush}
                detail={
                  q.data.capabilities.nativePush
                    ? "FCM configured; device test required"
                    : "Firebase Android credentials still required"
                }
              />
            </div>
          </Card>
          <Card
            title="Notification delivery log"
            sub="Provider acceptance ≠ display ≠ acknowledgement."
          >
            <div className="delivery-log">
              {q.data.notifications.length ? (
                q.data.notifications.slice(0, 8).map((n: any) => (
                  <div key={n.id}>
                    <div>
                      <strong>{n.title}</strong>
                      <Badge
                        tone={
                          n.status === "provider_accepted"
                            ? "teal"
                            : n.status === "failed"
                              ? "critical"
                              : "neutral"
                        }
                      >
                        {human(n.status)}
                      </Badge>
                    </div>
                    <small>
                      {time(n.created_at)} UTC · {n.attempts.length} attempt(s)
                    </small>
                    {n.attempts.map((a: any, i: number) => (
                      <p key={i}>
                        {a.provider} · {human(a.status)}{" "}
                        {a.error && "· " + a.error}
                      </p>
                    ))}
                    <div className="chips">
                      {n.events.map((e: any, i: number) => (
                        <Badge key={i} tone="teal">
                          {e.kind}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <Empty title="Ready for your first alert">
                  Trigger a scenario or send a connection test.
                </Empty>
              )}
            </div>
          </Card>
          <Card title="Scheduled follow-ups">
            <div className="padded">
              {q.data.jobs.length ? (
                q.data.jobs.slice(0, 5).map((j: any, i: number) => (
                  <div className="job-row" key={i}>
                    <Clock size={16} />
                    <div>
                      <strong>{human(j.kind)}</strong>
                      <small>
                        {date(j.due_at)} · {time(j.due_at)} UTC
                      </small>
                    </div>
                    <Badge>{j.status}</Badge>
                  </div>
                ))
              ) : (
                <p className="muted">
                  Approve a follow-up to schedule its response deadline.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
      <Modal
        title="Reset the demonstration?"
        description="Start a fresh synthetic dataset. Old cases and notification links become inactive. Phone enrollment is preserved."
        open={reset}
        onClose={() => setReset(false)}
      >
        <div className="modal-actions">
          <button onClick={() => setReset(false)}>Keep current run</button>
          <button
            className="primary"
            disabled={!!busy}
            onClick={async () => {
              setBusy("reset");
              try {
                await command("/demo/reset");
                setResult(null);
                setSelected("");
                setReset(false);
                toast.success("New demo run ready");
              } catch (e: any) {
                toast.error(e.message);
              } finally {
                setBusy("");
              }
            }}
          >
            {busy === "reset" ? "Rebuilding data…" : "Reset & replay"}
          </button>
        </div>
      </Modal>
    </>
  );
}
function Status({
  label,
  ready,
  detail,
}: {
  label: string;
  ready: boolean;
  detail: string;
}) {
  return (
    <div className="status-row">
      <span className={"status-icon " + (ready ? "teal" : "high")}>
        {ready ? <Check size={16} /> : <Info size={16} />}
      </span>
      <div>
        <strong>{label}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}
export function Profile() {
  const { data, signOut } = useWorkspace();
  const q = useEndpoint("/devices");
  const command = useCommand();
  const [busy, setBusy] = useState(false),
    [audio, setAudio] = useState(
      localStorage.getItem("baxter-audio") === "true",
    );
  const [install, setInstall] = useState<any>(null);
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstall(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  return (
    <>
      <PageTitle
        title="Ready when it matters"
        description="Set up your phone, notifications, and voice input."
      />
      <div className="profile-grid">
        <Card title="Your workspace">
          <div className="profile-person">
            <span className="avatar large">
              {data.user.name
                .split(" ")
                .map((n: string) => n[0])
                .join("")}
            </span>
            <h2>{data.user.name}</h2>
            <p>{human(data.user.role)} · Baxter EMEA demo</p>
            <Badge tone="teal">Authenticated session</Badge>
          </div>
          <div className="padded">
            <button className="full" onClick={signOut}>
              <Power size={16} />
              Sign out
            </button>
          </div>
        </Card>
        <div>
          <Card
            title="Connect this device"
            sub="Push notifications open directly into the relevant case."
          >
            <div className="padded">
              <div className="notice">
                <Smartphone size={22} />
                <span>
                  {native
                    ? "Android app: critical alerts use the dedicated sound channel. On the device, allow notifications and confirm the channel sound."
                    : "For an iPhone, add this app to the Home Screen and launch it there. On Android, Chrome supports PWA push; the Android app adds a custom critical tone."}
                </span>
              </div>
              <div className="action-bar">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await enrolDevice(data.run.id);
                      await q.refetch();
                      toast.success("Device enrolled. Send a test next.");
                    } catch (e: any) {
                      toast.error(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Bell size={17} />
                  {busy ? "Connecting…" : "Enable notifications"}
                </button>
                <button
                  onClick={async () => {
                    try {
                      const r = await command("/devices/test");
                      toast.success(r.message);
                    } catch (e: any) {
                      toast.error(e.message);
                    }
                  }}
                >
                  <Send size={17} />
                  Send test push
                </button>
                {install && (
                  <button
                    onClick={async () => {
                      await install.prompt();
                      setInstall(null);
                    }}
                  >
                    Install app
                  </button>
                )}
              </div>
              {q.error && <ErrorPanel error={q.error} />}
              <div className="device-list">
                {q.data?.devices
                  .filter((d: any) => d.active)
                  .map((d: any) => (
                    <div key={d.id}>
                      <Smartphone size={21} />
                      <div>
                        <strong>{d.label}</strong>
                        <small>
                          {human(d.platform)} ·{" "}
                          {d.channel === "native" ? "Android push" : "Web Push"}
                        </small>
                      </div>
                      <Badge tone="teal">Enrolled</Badge>
                    </div>
                  ))}
              </div>
              <p className="small-copy muted">
                A phone needs trusted HTTPS and access to this server. localhost
                on your laptop is not reachable as localhost on the phone.
              </p>
            </div>
          </Card>
          <Card
            title="Sound & voice"
            sub="Designed for a clear, deliberate interaction."
          >
            <div className="padded">
              <div className="setting">
                <span className="metric-icon teal">
                  <Volume2 size={21} />
                </span>
                <div>
                  <strong>Foreground critical alert tone</strong>
                  <p>Plays while this app is open, after you enable audio.</p>
                </div>
                <button
                  className={audio ? "primary" : ""}
                  onClick={() => {
                    localStorage.setItem("baxter-audio", String(!audio));
                    setAudio(!audio);
                    if (!audio) playAlert();
                  }}
                >
                  {audio ? "Enabled" : "Enable audio"}
                </button>
              </div>
              <button onClick={playAlert}>
                <Headphones size={16} />
                Preview critical tone
              </button>
              <div className="setting">
                <span className="metric-icon teal">
                  <Mic size={21} />
                </span>
                <div>
                  <strong>OpenAI live transcription</strong>
                  <p>
                    Tap the assistant mic, speak, then review the transcript
                    before sending. Audio is transmitted to OpenAI only during
                    an active recording.
                  </p>
                </div>
              </div>
              <p className="small-copy muted">
                PWA background sound is controlled by the operating system. The
                native Android channel can use the bundled alert tone; neither
                bypasses mute or Do Not Disturb.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
