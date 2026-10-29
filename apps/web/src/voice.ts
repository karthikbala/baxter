import { api } from "./api";
import { MAX_VOICE_BYTES, MAX_VOICE_SECONDS, type VoiceLanguage } from "../../../packages/voice";

export type VoicePhase = "connecting" | "listening" | "transcribing" | "ready" | "error";
export type VoiceCapture = { finish: () => void; cancel: () => void };
export type VoiceOptions = {
  caseId: string;
  language?: VoiceLanguage;
  deviceId?: string;
  onLevel?: (level: number, seconds: number) => void;
  onPhase?: (phase: VoicePhase) => void;
  onCaptured?: (blob: Blob) => void;
  onDevices?: (devices: MediaDeviceInfo[]) => void;
};
export async function transcribeVoice(blob: Blob, runId: string, caseId: string, language: VoiceLanguage = "auto", signal?: AbortSignal) {
  const query = new URLSearchParams({ runId, caseId, language });
  const timeout = AbortSignal.timeout(90000);
  try {
    return await api<{ text: string; model: string }>(`/api/v1/voice/transcribe?${query}`, blob,
      { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  } catch (e: any) {
    if (signal?.aborted) throw e;
    if (e.status === 401) throw new Error("Sign in again, then retry this recording.");
    if (e.status === 409) throw new Error("This demo run changed. Reopen the case before recording again.");
    if (e.status === 413) throw new Error("This recording is too large. Please record a shorter message.");
    throw new Error("Transcription did not complete. Your recording is still here — tap Retry transcription.");
  }
}
export async function startVoice(
  runId: string,
  onText: (text: string) => void,
  onState: (state: string) => void,
  onEnd: () => void = () => {},
  signal?: AbortSignal,
  options: VoiceOptions = { caseId: "" },
): Promise<VoiceCapture> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
    throw new Error("Recording needs an HTTPS browser with microphone support. Use current Chrome or Safari.");
  signal?.throwIfAborted();
  options.onPhase?.("connecting");
  onState("Allow microphone access to start recording.");
  // Start capture locally, without waiting for a network/Realtime handshake.
  const stream = await navigator.mediaDevices.getUserMedia({ audio: {
    ...(options.deviceId ? { deviceId: { exact: options.deviceId } } : {}),
    channelCount: { ideal: 1 }, sampleRate: { ideal: 48000 },
    echoCancellation: true, noiseSuppression: true, autoGainControl: true,
  } });
  const releaseTracks = () => stream.getTracks().forEach(track => track.stop());
  if (signal?.aborted) { releaseTracks(); signal.throwIfAborted(); }
  let recorder: MediaRecorder;
  try {
    const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) throw new Error("This browser cannot record a supported audio format. Try Chrome or Safari.");
    recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 256000 });
  } catch (error) { releaseTracks(); throw error; }
  let context: AudioContext | undefined, analyser: AnalyserNode | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let ended = false, finishing = false, cancelled = false, bytes = 0;
  let chunks: Blob[] = [];
  const upload = new AbortController();
  const started = performance.now();
  const end = () => {
    if (ended) return;
    ended = true;
    clearInterval(timer);
    releaseTracks();
    void context?.close().catch(() => {});
    signal?.removeEventListener("abort", cancel);
    onEnd();
  };
  const cancel = () => {
    cancelled = true;
    upload.abort();
    if (recorder.state !== "inactive") recorder.stop();
    chunks = [];
    end();
  };
  const finish = () => {
    if (finishing || cancelled || ended) return;
    finishing = true;
    clearInterval(timer);
    options.onPhase?.("transcribing");
    onState("Transcribing…");
    // Wait for MediaRecorder's final dataavailable + stop before releasing tracks.
    if (recorder.state !== "inactive") recorder.stop();
  };
  signal?.addEventListener("abort", cancel, { once: true });
  recorder.ondataavailable = event => {
    if (cancelled || !event.data.size) return;
    chunks.push(event.data); bytes += event.data.size;
    if (bytes >= MAX_VOICE_BYTES - 65536) finish();
  };
  recorder.onerror = () => {
    if (cancelled) return;
    onState("The microphone stopped unexpectedly. Please record again.");
    options.onPhase?.("error");
    cancel();
  };
  recorder.onstop = async () => {
    releaseTracks(); clearInterval(timer);
    void context?.close().catch(() => {});
    if (cancelled) return;
    const blob = new Blob(chunks, { type: recorder.mimeType }); chunks = [];
    options.onCaptured?.(blob);
    try {
      if (blob.size < 100 || blob.size > MAX_VOICE_BYTES) throw new Error("No usable recording was captured. Check the microphone and record again.");
      const result = await transcribeVoice(blob, runId, options.caseId, options.language, upload.signal);
      if (cancelled) return;
      onText(result.text);
      options.onPhase?.("ready");
      onState(result.text ? "Transcript ready. Review and send." : "No speech was recognized. Please try speaking again.");
    } catch (error: any) {
      if (!cancelled) { options.onPhase?.("error"); onState(error.message); }
    } finally { end(); }
  };
  for (const track of stream.getAudioTracks()) track.addEventListener("ended", finish, { once: true });
  try {
    // Metering is advisory: it must never discard quiet speech or block recording.
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    try {
      if (options.onLevel && AudioContextClass) {
        context = new AudioContextClass();
        analyser = context!.createAnalyser(); analyser.fftSize = 2048;
        context!.createMediaStreamSource(stream).connect(analyser);
        void context!.resume().catch(() => {});
      }
    } catch { analyser = undefined; }
    recorder.start(250);
    options.onPhase?.("listening");
    onState("Listening… Tap Send when you’re done.");
    if (options.onDevices) void navigator.mediaDevices.enumerateDevices?.().then(devices => {
      if (!ended) options.onDevices?.(devices.filter(device => device.kind === "audioinput"));
    }).catch(() => {});
    timer = setInterval(() => {
      const seconds = (performance.now() - started) / 1000;
      let level = 0;
      if (analyser) {
        const samples = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(samples);
        level = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      }
      options.onLevel?.(Math.min(1, level * 5), seconds);
      if (seconds >= MAX_VOICE_SECONDS) finish();
    }, 100);
  } catch (error) { cancel(); throw error; }
  return { finish, cancel };
}
let audio: AudioContext | undefined;
export function playAlert() {
  audio ||= new AudioContext();
  audio.resume();
  const start = audio.currentTime;
  for (let i = 0; i < 3; i++) {
    const osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(i % 2 ? 660 : 880, start + i * 0.28);
    gain.gain.setValueAtTime(0, start + i * 0.28);
    gain.gain.linearRampToValueAtTime(0.14, start + i * 0.28 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + i * 0.28 + 0.22);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(start + i * 0.28);
    osc.stop(start + i * 0.28 + 0.24);
  }
}
