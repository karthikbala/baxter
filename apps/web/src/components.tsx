import { useEffect, useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowUpRight,
  Check,
  X,
  Ship,
  ArrowRight,
  Activity,
  Info,
} from "lucide-react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkAreaComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { date, human, money, number } from "./api";
echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkAreaComponent,
  CanvasRenderer,
]);
export const Badge = ({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) => (
  <span className={"badge " + tone}>
    <i />
    {children}
  </span>
);
export const Empty = ({
  title = "Nothing here yet",
  children,
}: {
  title?: string;
  children?: ReactNode;
}) => (
  <div className="empty">
    <Check size={26} />
    <h3>{title}</h3>
    <p>{children}</p>
  </div>
);
export const Loading = () => (
  <div className="loading">
    <span className="spinner" />
    Connecting to the workspace…
  </div>
);
export const ErrorPanel = ({
  error,
  retry,
}: {
  error: any;
  retry?: () => void;
}) => (
  <div className="error-panel">
    <Info size={20} />
    <div>
      <strong>{error?.message || "Something went wrong"}</strong>
      <p>Check the connection and try again.</p>
    </div>
    {retry && <button onClick={retry}>Retry</button>}
  </div>
);
export const PageTitle = ({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) => (
  <div className="page-title">
    <div>
      <div className="eyebrow">{eyebrow || "EMEA OPERATIONS"}</div>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
    <div className="title-actions">{children}</div>
  </div>
);
export const Card = ({
  title,
  sub,
  children,
  action,
  className = "",
}: {
  title?: string;
  sub?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) => (
  <section className={"card " + className}>
    {title && (
      <div className="card-head">
        <div>
          <h2>{title}</h2>
          {sub && <p>{sub}</p>}
        </div>
        {action}
      </div>
    )}
    {children}
  </section>
);
export const Metric = ({
  label,
  value,
  detail,
  tone = "teal",
  icon: Icon = Activity,
}: {
  label: string;
  value: any;
  detail: string;
  tone?: string;
  icon?: any;
}) => (
  <div className="metric">
    <div className="metric-top">
      {label}
      <span className={"metric-icon " + tone}>
        <Icon size={18} />
      </span>
    </div>
    <strong>{value}</strong>
    <p>{detail}</p>
  </div>
);
export function Modal({
  title,
  description,
  open,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className="modal">
          <div className="modal-head">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description || "Review the details below."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function StockChart({ impact }: { impact: any }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !impact?.projection) return;
    const chart = echarts.init(ref.current);
    chart.setOption({
      animationDuration: 400,
      color: ["#008775", "#e27566"],
      tooltip: { trigger: "axis" },
      legend: { bottom: 0, icon: "circle", textStyle: { color: "#657780" } },
      grid: { left: 48, right: 20, top: 16, bottom: 65 },
      xAxis: {
        type: "category",
        data: impact.projection.map((p: any) => "D+" + p.day),
        axisLine: { lineStyle: { color: "#e5ebee" } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#edf1f3" } },
        axisLabel: {
          formatter: (n: number) => (n >= 1000 ? n / 1000 + "k" : n),
        },
      },
      series: [
        {
          name: "Closing stock",
          type: "line",
          smooth: false,
          symbolSize: 5,
          areaStyle: { opacity: 0.07 },
          data: impact.projection.map((p: any) => p.onHand),
        },
        {
          name: "Unmet demand",
          type: "line",
          lineStyle: { type: "dashed" },
          data: impact.projection.map((p: any) => p.unmet),
        },
      ],
    });
    const o = new ResizeObserver(() => chart.resize());
    o.observe(ref.current);
    return () => {
      o.disconnect();
      chart.dispose();
    };
  }, [impact]);
  return (
    <div
      ref={ref}
      className="stock-chart"
      role="img"
      aria-label="Daily stock and unmet demand from the current inventory projection"
    />
  );
}
export function CaseRows({
  items,
  onOpen,
}: {
  items: any[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="case-list">
      {items.length === 0 ? (
        <Empty title="All clear">No cases match the current filters.</Empty>
      ) : (
        items.map((c) => (
          <button className="case-row" key={c.id} onClick={() => onOpen(c.id)}>
            <span className={"severity-bar " + c.severity} />
            <span className="case-symbol">
              <Ship size={19} />
            </span>
            <span className="case-main">
              <strong>{c.title}</strong>
              <small>
                {c.shipment_reference} <b>·</b> {c.city}, {c.country}
              </small>
            </span>
            <span className="case-impact">
              {Number(c.exposure) > 0 ? (
                <strong>{money(c.exposure)}</strong>
              ) : (
                <strong>{human(c.kind)}</strong>
              )}
              <small>
                {Number(c.exposure) > 0 ? "Order value exposed" : c.next_action}
              </small>
            </span>
            <span className="case-owner">
              <span className="avatar small">
                {c.owner_name
                  ?.split(" ")
                  .map((n: string) => n[0])
                  .join("")}
              </span>
              <small>{c.owner_name?.split(" ")[0]}</small>
            </span>
            <Badge tone={c.state === "resolved" ? "teal" : c.severity}>
              {c.state === "resolved" ? "Resolved" : c.severity}
            </Badge>
            <ArrowUpRight size={17} className="muted" />
          </button>
        ))
      )}
    </div>
  );
}
export function RouteMap({
  shipments,
  onOpen,
}: {
  shipments: any[];
  onOpen: (id: string) => void;
}) {
  const cities = [...new Map(shipments.map((s) => [s.city, s])).values()];
  const pos = (lon: number, lat: number) => [
    60 + ((lon + 12) / 72) * 540,
    240 - ((lat - 20) / 42) * 200,
  ];
  return (
    <div className="route-map">
      <svg
        viewBox="0 0 680 300"
        role="img"
        aria-label="Schematic EMEA destination network"
      >
        <defs>
          <pattern
            id="dots"
            width="18"
            height="18"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill="#cbd9dc" />
          </pattern>
        </defs>
        <rect width="680" height="300" fill="url(#dots)" />
        <text x="34" y="36" fill="#829a9e" fontSize="10" letterSpacing="3">
          EUROPE
        </text>
        <text x="438" y="245" fill="#829a9e" fontSize="10" letterSpacing="3">
          MIDDLE EAST
        </text>
        {cities.map((s) => {
          const [x, y] = pos(Number(s.lon), Number(s.lat));
          const critical = shipments.some(
            (t) => t.city === s.city && Number(t.delay_days) > 0,
          );
          return (
            <g
              key={s.city}
              onClick={() => onOpen(s.id)}
              tabIndex={0}
              role="button"
              aria-label={"Open shipment to " + s.city}
              onKeyDown={(e) => e.key === "Enter" && onOpen(s.id)}
              className="map-city"
            >
              <path
                d={`M 35 267 Q ${x - 60} ${y - 10} ${x} ${y}`}
                fill="none"
                stroke={critical ? "#cd9c82" : "#9abcb8"}
                strokeWidth="1"
                opacity=".5"
              />
              <circle
                cx={x}
                cy={y}
                r="10"
                fill={critical ? "#f9e3d9" : "#d9ede8"}
              />
              <circle
                cx={x}
                cy={y}
                r="4"
                fill={critical ? "#d18058" : "#008775"}
              />
              <text x={x + 13} y={y + 4} fill="#284d55" fontSize="11">
                {s.city}
              </text>
            </g>
          );
        })}
        <text x="20" y="284" fill="#607980" fontSize="10">
          Global origins → destination DCs
        </text>
      </svg>
      <div className="map-key">
        <span>
          <i className="dot teal" />
          On baseline
        </span>
        <span>
          <i className="dot high" />
          ETA drift present
        </span>
        <small>Schematic · destinations from shipment records</small>
      </div>
    </div>
  );
}
export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="facts">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
