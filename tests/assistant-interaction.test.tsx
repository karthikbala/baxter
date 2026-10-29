// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { Assistant } from "../apps/web/src/assistant";
import { Workspace } from "../apps/web/src/workspace";
import { api } from "../apps/web/src/api";
import { startVoice, transcribeVoice } from "../apps/web/src/voice";
vi.mock("../apps/web/src/api", () => ({ api: vi.fn() }));
vi.mock("../apps/web/src/voice", () => ({ startVoice: vi.fn(), transcribeVoice: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
let el: HTMLDivElement, root: Root;
const onAction = vi.fn();
const data = { run: { id: "run" }, cases: [{ id: "one", shipment_reference: "SHP-1" }, { id: "two", shipment_reference: "SHP-2" }] };
async function render(id = "one") { await act(async () => { root.render(<Workspace.Provider value={{ data }}><Assistant caseId={id} onAction={onAction} /></Workspace.Provider>); }); }
const deferred = () => { let resolve!: (value: any) => void; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
async function click(text: string) { const button = Array.from(el.querySelectorAll("button")).find(b => b.textContent?.includes(text))!; expect(button).toBeTruthy(); await act(async () => button.click()); }
async function input(value: string) { await act(async () => { const t = el.querySelector("textarea")!; Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(t, value); t.dispatchEvent(new Event("input", { bubbles: true })); }); }
beforeEach(() => { (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true; vi.clearAllMocks(); vi.mocked(api).mockResolvedValue([]); el = document.createElement("div"); document.body.append(el); root = createRoot(el); });
afterEach(async () => { await act(async () => root.unmount()); el.remove(); });
it("renders existing replies as content-sized messages, without the empty-chat welcome", async () => {
  vi.mocked(api).mockResolvedValue([{ role: "assistant", text: "Short reply." }]); await render();
  expect(el.querySelectorAll(".assistant-panel")).toHaveLength(1);
  expect(el.querySelector(".message.assistant")?.textContent).toContain("Short reply.");
  expect(el.querySelector(".assistant-intro")).toBeNull();
});
it("waits for history before sending and supports retry when history fails", async () => {
  const history = deferred(); vi.mocked(api).mockReturnValueOnce(history.promise); await render();
  expect(el.textContent).toContain("Loading conversation");
  expect(el.querySelector<HTMLButtonElement>(".suggestions button")!.disabled).toBe(true);
  await act(async () => history.resolve([]));
  expect(el.querySelector<HTMLButtonElement>(".suggestions button")!.disabled).toBe(false);
  vi.mocked(api).mockRejectedValueOnce(new Error("Network failure")); await render("two");
  expect(el.textContent).toContain("Couldn’t load"); await click("Retry");
  expect(el.textContent).toContain("Let’s work through this.");
});
it("sends a suggestion, shows pending feedback and opens a prepared action", async () => {
  await render(); const reply = deferred(); vi.mocked(api).mockReturnValueOnce(reply.promise);
  await click("Compare recovery options"); expect(el.textContent).toContain("Reviewing the case evidence");
  await act(async () => reply.resolve({ text: "Transfer is feasible.", actions: [{ title: "Review transfer", action: { id: "a1" } }] }));
  expect(el.textContent).toContain("Transfer is feasible."); await click("Review transfer");
  expect(onAction).toHaveBeenCalledWith({ id: "a1" });
});
it("does not put a late response into a different case", async () => {
  await render(); const reply = deferred(); vi.mocked(api).mockReturnValueOnce(reply.promise);
  await click("Compare recovery options"); await render("two");
  await act(async () => reply.resolve({ text: "OLD CASE RESPONSE" }));
  expect(el.textContent).not.toContain("OLD CASE RESPONSE"); expect(el.textContent).toContain("SHP-2");
});
it("restores the draft after a failed send", async () => {
  await render(); await input("Explain the delay"); vi.mocked(api).mockRejectedValueOnce(new Error("Offline"));
  await act(async () => el.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(el.querySelector("textarea")!.value).toBe("Explain the delay");
  expect(el.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.disabled).toBe(false);
});
it("does not submit Shift+Enter or IME composition", async () => {
  await render(); await input("Two lines"); const calls = vi.mocked(api).mock.calls.length;
  await act(async () => { const field = el.querySelector("textarea")!; field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true })); field.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })); });
  expect(vi.mocked(api).mock.calls).toHaveLength(calls);
});
it("keeps the reading position when a reply arrives and offers jump to latest", async () => {
  await render(); const reply = deferred(); vi.mocked(api).mockReturnValueOnce(reply.promise); await click("Compare recovery options");
  const list = el.querySelector<HTMLElement>(".messages")!;
  Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1000 }); Object.defineProperty(list, "clientHeight", { configurable: true, value: 300 });
  await act(async () => { list.scrollTop = 100; list.dispatchEvent(new Event("scroll", { bubbles: true })); });
  await act(async () => reply.resolve({ text: "New reply" })); expect(list.scrollTop).toBe(100);
  await click("Jump to latest"); expect(list.scrollTop).toBe(1000);
});
it("keeps a voice transcript in the composer for review without auto-sending", async () => {
  await render(); let transcript!: (text: string) => void;
  vi.mocked(startVoice).mockImplementation(async (_run, onText) => { transcript = onText; return { finish: () => transcript("Explain the ETA"), cancel: () => {} } as any; });
  await act(async () => el.querySelector<HTMLButtonElement>('[aria-label="Start voice input"]')!.click());
  expect(el.querySelector('[aria-label="Finish recording"]')).toBeTruthy();
  await act(async () => el.querySelector<HTMLButtonElement>('[aria-label="Finish recording"]')!.click());
  expect(el.querySelector("textarea")!.value).toBe("Explain the ETA");
  expect(el.textContent).toContain("Transcript ready. Review and send.");
  expect(vi.mocked(api).mock.calls.every(([path]) => path.includes("/history"))).toBe(true);
});
it("recovers the microphone control after permission is denied", async () => {
  await render(); vi.mocked(startVoice).mockRejectedValueOnce(new Error("Microphone unavailable"));
  await act(async () => el.querySelector<HTMLButtonElement>('[aria-label="Start voice input"]')!.click());
  expect(el.querySelector<HTMLButtonElement>('[aria-label="Start voice input"]')!.disabled).toBe(false);
  expect(el.querySelector('[aria-label="Finish recording"]')).toBeNull();
});
it("preserves a typed draft and keeps voice controls minimal during transcription", async () => {
  await render(); await input("Please explain:");
  let onText!: (text: string) => void, options: any, onEnd!: () => void;
  vi.mocked(startVoice).mockImplementation(async (_run, text, _state, end, _signal, settings) => {
    onText = text; options = settings; onEnd = end!;
    return { finish: () => { options.onPhase("transcribing"); options.onCaptured(new Blob(["recording"], {type: "audio/webm"})); }, cancel: () => {} };
  });
  await act(async () => el.querySelector<HTMLButtonElement>('[aria-label="Start voice input"]')!.click());
  await act(async () => el.querySelector<HTMLButtonElement>('[aria-label="Finish recording"]')!.click());
  expect(el.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.disabled).toBe(true);
  expect(el.querySelector<HTMLButtonElement>('[aria-label="Cancel transcription"]')!.disabled).toBe(false);
  expect(el.querySelector("select, audio, [role=meter], [role=progressbar]")).toBeNull();
  expect(options.language).toBeUndefined();
  expect(options.deviceId).toBeUndefined();
  await act(async () => { onText("why this is late"); options.onPhase("ready"); onEnd(); });
  expect(el.querySelector("textarea")!.value).toBe("Please explain: why this is late");
  expect(el.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.disabled).toBe(false);
  expect(el.querySelector("audio")).toBeNull();
  expect(el.querySelector("textarea")!.value).toBe("Please explain: why this is late");
  expect(el.querySelector(".voice-review, .voice-tools")).toBeNull();
});
it("Send stops recording and submits the complete transcription exactly once", async () => {
  await render(); await input("Please check:");
  let transcript!: (text: string) => void;
  const finish = vi.fn();
  vi.mocked(startVoice).mockImplementation(async (_run, text, _state, _end, _signal, options) => {
    transcript = text; options?.onPhase?.("listening"); return { finish, cancel: vi.fn() };
  });
  await act(async () => el.querySelector<HTMLButtonElement>('[aria-label="Start voice input"]')!.click());
  const sendButton = el.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!;
  expect(sendButton.disabled).toBe(false);
  await act(async () => { sendButton.click(); sendButton.click(); });
  expect(finish).toHaveBeenCalledTimes(1);
  expect(vi.mocked(api).mock.calls.filter(([p]) => p === "/api/v1/assistant")).toHaveLength(0);
  vi.mocked(api).mockResolvedValueOnce({ text: "I will compare the options." });
  await act(async () => transcript("do not approve the Utrecht transfer"));
  expect(vi.mocked(api).mock.calls.filter(([p]) => p === "/api/v1/assistant")).toEqual([
    ["/api/v1/assistant", { caseId: "one", runId: "run", message: "Please check: do not approve the Utrecht transfer" }],
  ]);
  expect(el.querySelector("textarea")!.value).toBe("");
  expect(el.textContent).toContain("I will compare the options.");
});
it("cancelling transcription after Send prevents a late message from being submitted", async () => {
  await render(); let transcript!: (text: string) => void;
  vi.mocked(startVoice).mockImplementation(async (_run, text) => { transcript = text; return { finish: vi.fn(), cancel: vi.fn() }; });
  await act(async () => el.querySelector<HTMLButtonElement>('[aria-label="Start voice input"]')!.click());
  expect(el.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.disabled).toBe(false);
  await act(async () => el.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click());
  await act(async () => el.querySelector<HTMLButtonElement>('[aria-label="Cancel transcription"]')!.click());
  await act(async () => transcript("Late transcript"));
  expect(vi.mocked(api).mock.calls.filter(([p]) => p === "/api/v1/assistant")).toHaveLength(0);
  expect(el.querySelector("textarea")!.value).toBe("");
});
it("a failed voice send retains the recording and sends only after a successful retry", async () => {
  await render(); let settings: any;
  vi.mocked(startVoice).mockImplementation(async (_run, _text, _state, _end, _signal, options) => {
    settings = options;
    return { finish: () => { settings.onCaptured(new Blob(["audio"], {type:"audio/webm"})); settings.onPhase("error"); }, cancel: vi.fn() };
  });
  await act(async () => el.querySelector<HTMLButtonElement>('[aria-label="Start voice input"]')!.click());
  await act(async () => el.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click());
  expect(vi.mocked(api).mock.calls.filter(([p]) => p === "/api/v1/assistant")).toHaveLength(0);
  vi.mocked(transcribeVoice).mockResolvedValueOnce({ text: "Explain the delay", model: "gpt-transcribe" });
  vi.mocked(api).mockResolvedValueOnce({ text: "Here is the explanation." });
  await click("Retry transcription");
  expect(vi.mocked(api).mock.calls.filter(([p]) => p === "/api/v1/assistant")).toHaveLength(1);
  expect(el.textContent).toContain("Here is the explanation.");
  expect(el.querySelector(".voice-retry")).toBeNull();
});
