import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  useNavigate,
  useLocation,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import {
  LayoutDashboard,
  Ship,
  ShieldAlert,
  FileCheck2,
  Boxes,
  Network as NetworkIcon,
  Users,
  Database,
  Clapperboard,
  Settings,
  Sparkles,
  ArrowRight,
  Bell,
  Menu,
  X,
  WifiOff,
  Search,
  LogIn,
  Activity,
  MessageCircle,
  Smartphone,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { Workspace } from "./workspace";
import { api, API_BASE, date } from "./api";
import { Badge, ErrorPanel, Loading, PageTitle } from "./components";
import { Overview, Shipments, Customs, Inventory } from "./operations";
import { Cases, CaseDetail, ActionReview } from "./cases";
import { Network, Partners, DataQuality } from "./network";
import { Demo, Profile } from "./demo";
import { Assistant } from "./assistant";
import { native, nativeListeners } from "./device";
import { playAlert } from "./voice";
import { readSession } from "./session";
import { installErrorReporting, reportError } from "./diagnostics";
import "./styles.css";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error: any) =>
        error.status === 401 || error.status === 403 ? false : count < 1,
      staleTime: 10000,
      refetchOnWindowFocus: true,
    },
  },
});
const nav = [
  ["/", "Overview", LayoutDashboard],
  ["/cases", "Action centre", ShieldAlert],
  ["/shipments", "Shipments", Ship],
  ["/customs", "Customs & costs", FileCheck2],
  ["/inventory", "Inventory", Boxes],
  ["/network", "Network & scenarios", NetworkIcon],
  ["/partners", "Partners", Users],
  ["/data-quality", "Data quality", Database],
] as const;
function ServerSetup() {
  const [url, setUrl] = useState("");
  return (
    <div className="login-panel">
      <span className="eyebrow">ANDROID DEMO SETUP</span>
      <h2>Connect your workspace</h2>
      <p>
        Enter the trusted HTTPS address of your Baxter Response server. Sign-in
        and operational requests will use this address.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            const target = new URL(url);
            if (
              target.protocol !== "https:" ||
              target.username ||
              target.password
            )
              throw new Error("Use a trusted HTTPS server address.");
            localStorage.setItem("baxter-server-url", target.origin);
            window.location.reload();
          } catch (e: any) {
            toast.error(e.message);
          }
        }}
      >
        <label>
          Workspace URL
          <input
            type="url"
            required
            placeholder="https://response.your-domain.com"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </label>
        <button className="primary full">
          Connect workspace
          <ArrowRight size={17} />
        </button>
      </form>
    </div>
  );
}
function Login({ onSuccess }: { onSuccess: () => void }) {
  const [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  const q = useQuery({
    queryKey: ["public-config"],
    queryFn: () => api("/api/public-config"),
  });
  async function login(demo = false) {
    setBusy(true);
    setError("");
    try {
      await api(
        demo ? "/api/demo-login" : "/api/auth/sign-in/email",
        demo ? {} : { email, password },
      );
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login">
      <div className="login-story">
        <div className="brand">
          <span className="brand-icon">
            <Activity size={26} />
          </span>
          <span>
            Baxter<span>RESPONSE</span>
          </span>
        </div>
        <Badge tone="teal">BUILT FOR THE MOMENT THAT MATTERS</Badge>
        <h1>
          See the delay.
          <br />
          Understand the impact.
          <br />
          <em>Make the next move.</em>
        </h1>
        <p>
          A shared response workspace for EMEA supply chain teams. From the
          first signal to a verified outcome.
        </p>
        <div className="login-journey">
          <span>
            <Ship />
            Shipment signal
          </span>
          <ArrowRight />
          <span>
            <Activity />
            Business impact
          </span>
          <ArrowRight />
          <span>
            <ShieldAlert />
            Guided action
          </span>
        </div>
        <small>
          Standalone demonstration for Miebach & Baxter · synthetic business
          data
        </small>
      </div>
      <div className="login-panel">
        <span className="eyebrow">WELCOME TO YOUR WORKSPACE</span>
        <h2>Let’s keep things moving.</h2>
        <p>Sign in to Baxter Response.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            login();
          }}
        >
          <label>
            Email
            <input
              autoComplete="username"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
            <ArrowRight size={17} />
          </button>
        </form>
        {q.data?.demoAccess && (
          <>
            <div className="or">LOCAL DEMONSTRATION</div>
            <button
              className="full"
              disabled={busy}
              onClick={() => login(true)}
            >
              Enter as Alex Morgan
              <ArrowRight size={17} />
            </button>
            <p className="small-copy muted">
              Local demo access. Production requires an individual account.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
function AssistantPage() {
  const qc = useQueryClient();
  const data: any = qc.getQueryData(["bootstrap"]);
  const [selected, setSelected] = useState(""),
    [action, setAction] = useState<any>(null);
  const id =
    selected ||
    data.cases.find(
      (c: any) => c.kind === "stock_gap" && c.state !== "resolved",
    )?.id ||
    data.cases[0]?.id;
  return (
    <div className="assistant-page">
      <PageTitle
        title="Your next move, together"
        description="Talk or type. Review every proposed action."
      />
      <select
        aria-label="Assistant case context"
        value={id}
        onChange={(e) => setSelected(e.target.value)}
      >
        {data.cases
          .filter((c: any) => c.state !== "resolved")
          .map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.shipment_reference} · {c.title}
            </option>
          ))}
      </select>
      <Assistant caseId={id} onAction={setAction} />
      <ActionReview action={action} onClose={() => setAction(null)} />
    </div>
  );
}
function App() {
  const qc = useQueryClient(),
    navigate = useNavigate(),
    locationState = useLocation();
  const path = locationState.pathname;
  const [menu, setMenu] = useState(false),
    [offline, setOffline] = useState(!navigator.onLine);
  const q = useQuery({
    queryKey: ["bootstrap"],
    enabled: !native || !!API_BASE,
    queryFn: () => readSession(() => api("/api/v1/bootstrap")),
    refetchInterval: (query) =>
      query.state.data === null ? false : 15000,
  });
  const go = (to: string) => {
    setMenu(false);
    navigate({ to } as any);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    const online = () => setOffline(!navigator.onLine);
    window.addEventListener("online", online);
    window.addEventListener("offline", online);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", online);
    };
  }, []);
  useEffect(() => {
    if (!q.data) return;
    let source: EventSource | undefined;
    if (!API_BASE) {
      source = new EventSource("/api/v1/events", { withCredentials: true });
      source.addEventListener("change", () => qc.invalidateQueries());
    }
    const onPush = (p: any) => {
      if (p.runId !== q.data.run.id) return;
      if (native && p.notificationId)
        api("/api/v1/notifications/" + p.notificationId + "/events", {
          runId: p.runId,
          kind: "received",
        }).catch(() => {});
      qc.invalidateQueries();
      toast(p.title, {
        description: p.body,
        action: { label: "Open case", onClick: () => go(p.link || "/cases") },
      });
      if (
        p.severity === "critical" &&
        localStorage.getItem("baxter-audio") === "true"
      )
        playAlert();
    };
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "push") onPush(e.data);
    };
    navigator.serviceWorker?.addEventListener("message", handler);
    let cleanup: (() => void) | undefined;
    let disposed = false;
    nativeListeners(onPush, go).then((fn) => {
      if (disposed) fn();
      else cleanup = fn;
    });
    return () => {
      disposed = true;
      source?.close();
      navigator.serviceWorker?.removeEventListener("message", handler);
      cleanup?.();
    };
  }, [q.data?.run.id]);
  useEffect(() => {
    if (!q.data) return;
    const params = new URLSearchParams(window.location.search),
      id = params.get("notification"),
      runId = params.get("run");
    if (id && runId === q.data.run.id)
      api("/api/v1/notifications/" + id + "/events", {
        runId,
        kind: "opened",
      }).catch(() => {});
  }, [path, locationState.searchStr, q.data?.run.id]);
  async function signOut() {
    try {
      await api("/api/auth/sign-out", {});
    } finally {
      localStorage.removeItem("baxter-token");
      qc.clear();
      go("/");
      qc.invalidateQueries();
    }
  }
  if (native && !API_BASE) return <ServerSetup />;
  if (q.isPending) return <Loading />;
  if (q.data === null)
    return <Login onSuccess={() => qc.invalidateQueries()} />;
  if (q.error) return <ErrorPanel error={q.error} retry={() => q.refetch()} />;
  const data = q.data;
  const selected = nav.find(([p]) =>
    p === "/" ? path === "/" : path.startsWith(p),
  );
  const Screen =
    path === "/" ? (
      <Overview />
    ) : path === "/cases" ? (
      <Cases />
    ) : path.startsWith("/cases/") ? (
      <CaseDetail id={path.split("/")[2]} />
    ) : path === "/shipments" ? (
      <Shipments />
    ) : path === "/customs" ? (
      <Customs />
    ) : path === "/inventory" ? (
      <Inventory />
    ) : path === "/network" ? (
      <Network />
    ) : path === "/partners" ? (
      <Partners />
    ) : path === "/data-quality" ? (
      <DataQuality />
    ) : path === "/demo" ? (
      <Demo />
    ) : path === "/profile" ? (
      <Profile />
    ) : path === "/assistant" ? (
      <AssistantPage />
    ) : (
      <ErrorPanel error={new Error("This page does not exist")} />
    );
  return (
    <Workspace.Provider value={{ data, go, signOut }}>
      <div className="app-shell">
        <aside className={"sidebar " + (menu ? "open" : "")}>
          <button className="brand" onClick={() => go("/")}>
            <span className="brand-icon">
              <Activity size={25} />
            </span>
            <span>
              Baxter<span>RESPONSE</span>
            </span>
          </button>
          <div className="workspace-pill">
            <span className="workspace-avatar">B</span>
            <div>
              <strong>EMEA Operations</strong>
              <small>Demonstration workspace</small>
            </div>
          </div>
          <div className="nav-label">WORKSPACE</div>
          <nav>
            {nav.map(([p, label, Icon]) => (
              <button
                key={p}
                className={selected?.[0] === p ? "active" : ""}
                onClick={() => go(p)}
              >
                <Icon size={18} />
                <span>{label}</span>
                {p === "/cases" && <b>{data.stats.cases}</b>}
              </button>
            ))}
          </nav>
          <div className="nav-label second">ASSIST & PRESENT</div>
          <nav>
            <button
              className={path === "/assistant" ? "active" : ""}
              onClick={() => go("/assistant")}
            >
              <Sparkles size={18} />
              Response assistant
            </button>
            {data.user.role === "presenter" && (
              <button
                className={path === "/demo" ? "active" : ""}
                onClick={() => go("/demo")}
              >
                <Clapperboard size={18} />
                Demo studio
              </button>
            )}
            <button
              className={path === "/profile" ? "active" : ""}
              onClick={() => go("/profile")}
            >
              <Settings size={18} />
              Device & settings
            </button>
          </nav>
          <div className="sidebar-bottom">
            <span className="powered">IN COLLABORATION WITH</span>
            <strong>
              miebach<span>.</span>
            </strong>
            <button className="user-button" onClick={() => go("/profile")}>
              <span className="avatar">
                {data.user.name
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")}
              </span>
              <div>
                <strong>{data.user.name}</strong>
                <small>{data.user.role}</small>
              </div>
              <Settings size={15} />
            </button>
          </div>
        </aside>
        {menu && (
          <div className="mobile-shade" onClick={() => setMenu(false)} />
        )}
        <div className="main-area">
          <header className="topbar">
            <div>
              <button
                className="icon-button mobile-only"
                onClick={() => setMenu(!menu)}
                aria-label="Toggle navigation"
              >
                <Menu size={22} />
              </button>
              <span className="breadcrumb">
                Workspace <span>/</span>{" "}
                <strong>
                  {selected?.[1] ||
                    (path === "/demo" && "Demo studio") ||
                    (path === "/assistant" && "Response assistant") ||
                    "Device & settings"}
                </strong>
              </span>
            </div>
            <div>
              <span className="demo-label">
                <i />
                DEMO DATA
              </span>
              <button
                className="icon-button"
                aria-label="Open alerts"
                onClick={() => go("/cases")}
              >
                <Bell size={19} />
                {data.stats.critical > 0 && (
                  <span className="notification-dot" />
                )}
              </button>
              <button
                className="avatar"
                aria-label="Open profile"
                onClick={() => go("/profile")}
              >
                {data.user.name
                  .split(" ")
                  .map((n: string) => n[0])
                  .join("")}
              </button>
            </div>
          </header>
          {offline && (
            <div className="offline">
              <WifiOff size={16} />
              Offline. Cached screens may be visible; actions need a connection.
            </div>
          )}
          <main>{Screen}</main>
          <footer className="workspace-footer">
            <span>
              Synthetic EMEA business data · No live Baxter operational data
            </span>
            <span>Business clock {date(data.run.business_at)} · UTC</span>
          </footer>
        </div>
        <nav className="bottom-nav">
          {[
            ["/", "Today", LayoutDashboard],
            ["/cases", "Cases", ShieldAlert],
            ["/assistant", "Assistant", Sparkles],
            ["/profile", "Profile", Smartphone],
          ].map(([p, label, Icon]: any) => (
            <button
              key={p}
              onClick={() => go(p)}
              className={
                (p === "/" ? path === "/" : path.startsWith(p)) ? "active" : ""
              }
            >
              <Icon size={21} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </div>
    </Workspace.Provider>
  );
}
function RouteError({ error, reset }: ErrorComponentProps) {
  useEffect(() => { reportError(error, "render"); }, [error]);
  return <div className="login-panel"><h2>This screen could not load</h2>
    <p>We’ve attempted to report the error. You can retry or return to the overview.</p>
    <button className="primary" onClick={reset}>Try again</button>{" "}
    <a href="/">Back to overview</a></div>;
}
const rootRoute = createRootRoute({ component: App, errorComponent: RouteError });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/" });
const catchRoute = createRoute({ getParentRoute: () => rootRoute, path: "$" });
const router = createRouter({
  routeTree: rootRoute.addChildren([indexRoute, catchRoute]),
});
installErrorReporting();
const root = ((window as any).__baxterRoot ||= createRoot(
  document.getElementById("root")!,
));
root.render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" closeButton />
    </QueryClientProvider>
  </React.StrictMode>,
);
