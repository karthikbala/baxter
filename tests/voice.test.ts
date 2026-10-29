// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { startVoice, transcribeVoice } from "../apps/web/src/voice";
import { api } from "../apps/web/src/api";
vi.mock("../apps/web/src/api", () => ({ api: vi.fn() }));
class Recorder {
  static instances: Recorder[] = [];
  static isTypeSupported = vi.fn((type: string) => type.includes("webm"));
  state = "inactive"; mimeType: string;
  ondataavailable?: (event: any) => void; onstop?: () => void; onerror?: () => void;
  constructor(_stream: any, options: any) { this.mimeType = options.mimeType; Recorder.instances.push(this); }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; }
  flush() { this.ondataavailable?.({ data: new Blob(["x".repeat(500)]) }); return this.onstop?.(); }
}
let track: any, stream: any;
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks(); Recorder.instances = [];
  track = { stop: vi.fn(), addEventListener: vi.fn() };
  stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  vi.stubGlobal("MediaRecorder", Recorder);
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {
    getUserMedia: vi.fn().mockResolvedValue(stream), enumerateDevices: vi.fn().mockResolvedValue([]),
  } });
  vi.mocked(api).mockResolvedValue({ text: "The final words.", model: "gpt-transcribe" });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("captures locally through pauses and waits for the final chunk before uploading", async () => {
  const text = vi.fn(), end = vi.fn();
  const capture = await startVoice("run", text, vi.fn(), end, undefined, { caseId: "case" });
  expect(api).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(15000);
  expect(Recorder.instances[0].state).toBe("recording"); expect(text).not.toHaveBeenCalled();
  capture.finish(); capture.finish();
  expect(track.stop).not.toHaveBeenCalled(); expect(api).not.toHaveBeenCalled();
  await Recorder.instances[0].flush();
  expect(track.stop).toHaveBeenCalled(); expect(api).toHaveBeenCalledTimes(1);
  expect(vi.mocked(api).mock.calls[0][1]).toBeInstanceOf(Blob);
  expect((vi.mocked(api).mock.calls[0][1] as Blob).size).toBe(500);
  expect(text).toHaveBeenCalledWith("The final words."); expect(end).toHaveBeenCalledTimes(1);
});
it("keeps the recording when the provider fails and supports explicit retry", async () => {
  vi.mocked(api).mockRejectedValueOnce(new Error("Offline"));
  const captured = vi.fn(), state = vi.fn(), text = vi.fn();
  const capture = await startVoice("run", text, state, vi.fn(), undefined, { caseId: "case", onCaptured: captured });
  capture.finish(); await Recorder.instances[0].flush();
  expect(text).not.toHaveBeenCalled(); expect(state).toHaveBeenLastCalledWith(expect.stringContaining("Retry transcription"));
  const blob = captured.mock.calls[0][0];
  expect(await transcribeVoice(blob, "run", "case")).toMatchObject({ text: "The final words." });
});
it("releases a microphone granted after the component has been cancelled", async () => {
  let resolve!: (value: any) => void;
  vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const abort = new AbortController();
  const pending = startVoice("run", vi.fn(), vi.fn(), vi.fn(), abort.signal, { caseId: "case" });
  abort.abort(); resolve(stream);
  await expect(pending).rejects.toHaveProperty("name", "AbortError");
  expect(track.stop).toHaveBeenCalledTimes(1); expect(api).not.toHaveBeenCalled();
});
it("does not publish late results after cancelling an upload", async () => {
  let resolve!: (value: any) => void;
  vi.mocked(api).mockReturnValueOnce(new Promise(r => { resolve = r; }));
  const text = vi.fn(), end = vi.fn(); const abort = new AbortController();
  const capture = await startVoice("run", text, vi.fn(), end, abort.signal, { caseId: "case" });
  capture.finish(); const pending = Recorder.instances[0].flush();
  abort.abort(); resolve({ text: "OLD CASE" }); await pending;
  expect(text).not.toHaveBeenCalled(); expect(end).toHaveBeenCalledTimes(1);
});
it("stops at the duration limit and selects MP4 on browsers without WebM", async () => {
  Recorder.isTypeSupported.mockImplementation(type => type === "audio/mp4");
  const capture = await startVoice("run", vi.fn(), vi.fn(), vi.fn(), undefined, { caseId: "case", deviceId: "headset" });
  expect(Recorder.instances[0].mimeType).toBe("audio/mp4");
  expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ audio: expect.objectContaining({ deviceId: { exact: "headset" } }) }));
  await vi.advanceTimersByTimeAsync(120000);
  expect(Recorder.instances[0].state).toBe("inactive");
  capture.cancel();
});
