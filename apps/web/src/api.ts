import { reportError } from "./diagnostics";
export const API_BASE =
  import.meta.env.VITE_API_URL ||
  localStorage.getItem("baxter-server-url") ||
  "";
export async function api<T = any>(path: string, body?: unknown, options: { signal?: AbortSignal } = {}): Promise<T> {
  const token = localStorage.getItem("baxter-token");
  const res = await fetch(API_BASE + path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers: {
      ...(body !== undefined ? { "Content-Type": body instanceof Blob ? body.type : "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    signal: options.signal,
  }).catch(error => { if (error.name !== "AbortError") reportError(error, "api"); throw error; });
  const auth = res.headers.get("set-auth-token");
  if (auth && API_BASE) localStorage.setItem("baxter-token", auth);
  const json = await res
    .json()
    .catch(() => ({ error: "Service returned an invalid response" }));
  if (!res.ok) {
    if (res.status >= 500) reportError(new Error("API request failed"), "api", res.headers.get("x-request-id") || undefined, res.status);
    throw Object.assign(new Error(json.error || "Request failed"), {
      status: res.status,
    });
  }
  return json;
}
export const money = (n: any) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number(n || 0));
export const number = (n: any) =>
  new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(
    Number(n || 0),
  );
export const date = (d: any) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : "Not confirmed";
export const time = (d: any) =>
  d
    ? new Date(d).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      })
    : "—";
export const human = (s: string) => String(s || "").replaceAll("_", " ");
