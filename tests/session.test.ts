import { describe, expect, it } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { readSession } from "../apps/web/src/session";

describe("sign-in session lifecycle", () => {
  it("keeps the sign-in screen mounted through refetch and reconnect failures, then accepts login", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let load: () => Promise<unknown> = async () => { throw { status: 401 }; };
    const observer = new QueryObserver(client, {
      queryKey: ["bootstrap"], queryFn: () => readSession(() => load()),
    });
    const states: string[] = [];
    const unsubscribe = observer.subscribe((r) => {
      states.push(r.isPending ? "loading" : r.data === null ? "login" : r.isError ? "error" : "workspace");
    });
    await observer.refetch();
    expect(observer.getCurrentResult().data).toBeNull();
    states.length = 0;
    await observer.refetch();
    load = async () => { throw new Error("Offline"); };
    await observer.refetch();
    expect(states.length).toBeGreaterThan(0);
    expect(states.every((state) => state === "login")).toBe(true);
    load = async () => ({ run: { id: "signed-in" } });
    await observer.refetch();
    expect(states.at(-1)).toBe("workspace");
    load = async () => { throw { status: 401 }; };
    await observer.refetch();
    expect(states.at(-1)).toBe("login");
    unsubscribe();
    client.clear();
  });

  it("does not disguise server failures as a signed-out session", async () => {
    await expect(readSession(async () => { throw { status: 500 }; })).rejects.toEqual({ status: 500 });
  });
});
