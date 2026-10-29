import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Mic,
  AudioLines,
  ArrowUp,
  X,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "./api";
import { useWorkspace } from "./workspace";
import { startVoice, transcribeVoice, type VoiceCapture, type VoicePhase } from "./voice";
export function Assistant(props: { caseId?: string; onAction: (action: any) => void; compact?: boolean }) {
  const { data } = useWorkspace();
  // Keep drafts, pending replies and voice capture isolated to their case.
  return <AssistantConversation key={`${data.run.id}:${props.caseId}`} {...props} />;
}
function AssistantConversation({
  caseId,
  onAction,
  compact = false,
}: {
  caseId?: string;
  onAction: (action: any) => void;
  compact?: boolean;
}) {
  const { data } = useWorkspace();
  const [messages, setMessages] = useState<any[]>([]),
    [input, setInput] = useState(""),
    [busy, setBusy] = useState(false),
    [voice, setVoice] = useState(""),
    [recording, setRecording] = useState(false),
    [loading, setLoading] = useState(!!caseId),
    [historyError, setHistoryError] = useState(false),
    [historyAttempt, setHistoryAttempt] = useState(0),
    [atBottom, setAtBottom] = useState(true);
  const [voicePhase, setVoicePhase] = useState<VoicePhase | "">("");
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const capture = useRef<VoiceCapture | null>(null);
  const controller = useRef<AbortController | null>(null);
  const draft = useRef("");
  const pendingVoiceSend = useRef(false);
  const transcriptSent = useRef(false);
  const sending = useRef(false);
  const voiceBusy = recording || voicePhase === "transcribing";
  const messageList = useRef<HTMLDivElement>(null);
  const followReplies = useRef(true);
  useEffect(() => { draft.current = input; }, [input]);
  useEffect(() => {
    let active = true;
    setMessages([]);
    setLoading(!!caseId);
    setHistoryError(false);
    if (caseId)
      api("/api/v1/assistant/" + caseId + "/history")
        .then((m) => {
          if (active) { setMessages(m); setLoading(false); }
        })
        .catch(() => { if (active) { setHistoryError(true); setLoading(false); } });
    setInput("");
    controller.current?.abort();
    capture.current?.cancel();
    setRecording(false);
    setVoice("");
    return () => {
      active = false;
    };
  }, [caseId, data.run.id, historyAttempt]);
  useEffect(
    () => () => {
      controller.current?.abort();
      capture.current?.cancel();
    },
    [],
  );
  useEffect(() => {
    const list = messageList.current;
    if (list && followReplies.current) list.scrollTop = list.scrollHeight;
  }, [messages, busy]);
  async function send(text = input, fromVoice = false) {
    if (!text.trim() || busy || sending.current || (!fromVoice && voiceBusy) || loading || historyError || !caseId) return;
    sending.current = true;
    followReplies.current = true;
    setAtBottom(true);
    setInput("");
    draft.current = "";
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);
    try {
      const r = await api("/api/v1/assistant", {
        caseId,
        runId: data.run.id,
        message: text,
      });
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: r.text || r.message,
          mode: r.mode,
          cards: r.actions,
        },
      ]);
    } catch (e: any) {
      toast.error(e.message);
      setInput(text);
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  function submit() {
    if (busy || loading || historyError || voicePhase === "transcribing") return;
    if (recording) {
      if (!capture.current || pendingVoiceSend.current) return;
      pendingVoiceSend.current = true;
      setRecording(false);
      setVoicePhase("transcribing");
      capture.current.finish();
      return;
    }
    void send();
  }
  function receiveTranscript(text: string) {
    setRecordedAudio(null);
    setRecording(false);
    setVoicePhase("ready");
    const shouldSend = pendingVoiceSend.current;
    pendingVoiceSend.current = false;
    if (!text.trim()) {
      setVoice("No speech was captured. Please try again.");
      return;
    }
    const combined = [draft.current.trim(), text.trim()].filter(Boolean).join(" ");
    if (shouldSend) {
      transcriptSent.current = true;
      setVoice("");
      void send(combined, true);
    } else {
      setInput(combined);
      draft.current = combined;
      setVoice("Transcript ready. Review and send.");
    }
  }
  async function mic() {
    if (voicePhase === "transcribing") { discardRecording(); return; }
    if (recording) {
      if (capture.current) capture.current.finish();
      else {
        controller.current?.abort();
        setVoice("Recording cancelled.");
        setVoicePhase("");
      }
      setRecording(false);
      return;
    }
    try {
      setRecording(true);
      pendingVoiceSend.current = false;
      transcriptSent.current = false;
      setRecordedAudio(null);
      capture.current = null;
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      capture.current = await startVoice(
        data.run.id,
        (text) => {
          if (abort.signal.aborted) return;
          receiveTranscript(text);
        },
        (state) => { if (!abort.signal.aborted && !transcriptSent.current) setVoice(state); },
        () => setRecording(false),
        abort.signal,
        { caseId: caseId!,
          onPhase: phase => { if (!abort.signal.aborted) { setVoicePhase(phase); if (phase === "transcribing") setRecording(false); } },
          onCaptured: blob => { if (!abort.signal.aborted) setRecordedAudio(blob); } },
      );
    } catch (e: any) {
      setRecording(false);
      setVoicePhase("");
      setVoice(e.name === "NotAllowedError" ? "Microphone access was denied. Allow it in browser settings, then try again." : e.message || "Microphone unavailable");
      if (e.name !== "AbortError")
        toast.error(e.message || "Microphone unavailable");
    }
  }
  async function retryTranscription() {
    if (!recordedAudio || voiceBusy || !caseId) return;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    setVoicePhase("transcribing"); setVoice("Retrying the saved recording…");
    try {
      const result = await transcribeVoice(recordedAudio, data.run.id, caseId, "auto", abort.signal);
      if (abort.signal.aborted) return;
      receiveTranscript(result.text);
    } catch (e: any) { if (!abort.signal.aborted) { setVoicePhase("error"); setVoice(e.message); } }
  }
  function discardRecording() {
    pendingVoiceSend.current = false;
    controller.current?.abort(); capture.current?.cancel(); capture.current = null;
    setRecording(false); setVoicePhase(""); setRecordedAudio(null); setVoice("");
  }
  const selected = data.cases.find((c: any) => c.id === caseId);
  return (
    <section className={"assistant-panel " + (compact ? "compact" : "")} aria-label="Shipment response assistant">
      <div className="assistant-head">
        <span className="agent-mark">
          <Sparkles size={19} />
        </span>
        <div>
          <h2>Response assistant</h2>
          <p>{selected?.shipment_reference || "Evidence to action, together"}</p>
        </div>
        <span className="live-dot" />
      </div>
      <div className="messages" ref={messageList} role="log" aria-label="Conversation" aria-live="polite" aria-busy={busy || loading}
        onScroll={() => { const list = messageList.current!; const near = list.scrollHeight - list.scrollTop - list.clientHeight < 48; followReplies.current = near; setAtBottom(near); }}>
        {loading && <p className="chat-status" role="status">Loading conversation…</p>}
        {historyError && <div className="chat-status" role="alert">Couldn’t load this conversation. <button onClick={() => setHistoryAttempt(n => n + 1)}>Retry</button></div>}
        {!loading && !historyError && messages.length === 0 && <div className="assistant-intro">
          <span className="eyebrow">YOUR OPERATIONS COPILOT</span>
          <h3>Let’s work through this.</h3>
          <p>
            {selected
              ? "I can explain the evidence, compare recovery options, or prepare a follow-up for " +
                selected.shipment_reference +
                "."
              : "Open a case to give me shipment and inventory context."}
          </p>
          {selected && (
            <div className="context-chip">
              <span className={"dot " + selected.severity} />
              {selected.city} · {selected.title}
            </div>
          )}
        </div>}
        {messages.map((m, i) => (
          <div className={"message " + (m.role === "user" ? "user" : "assistant")} key={i}>
            {m.role === "assistant" && (
              <small>
                <Sparkles size={12} />{" "}
                {m.mode === "template"
                  ? "Guided fallback · live AI unavailable"
                  : "Response assistant"}
              </small>
            )}
            <p>{m.text}</p>
            {m.cards?.map((a: any, j: number) => (
              <button
                className="agent-action"
                key={j}
                onClick={() => onAction(a.action || a)}
              >
                {a.title || a.action?.title || "Review prepared action"}
                <ExternalLink size={15} />
              </button>
            ))}
          </div>
        ))}
        {busy && (
          <div className="thinking" role="status">
            <span />
            <span />
            <span /> Reviewing the case evidence
          </div>
        )}
      </div>
      {!atBottom && <button className="latest-reply" onClick={() => { const list = messageList.current!; list.scrollTop = list.scrollHeight; followReplies.current = true; setAtBottom(true); }}>Jump to latest ↓</button>}
      {selected && (
        <>
          <div className="suggestions">
            {[
              "What needs my attention?",
              "Compare recovery options",
              "Draft a follow-up",
            ].map((t) => (
              <button key={t} disabled={busy || voiceBusy || loading || historyError} onClick={() => send(t)}>
                {t}
              </button>
            ))}
          </div>
          <form
            className="agent-input"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <textarea
              aria-label="Message the response assistant"
              placeholder="Ask about this shipment…"
              rows={2}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
            <div>
              <span role="status" className="voice-status">{voice || "Review recommendations before acting"}</span>
              {voicePhase === "error" && recordedAudio && <button type="button" className="voice-retry" onClick={retryTranscription}>Retry transcription</button>}
              <button
                type="button"
                className={"icon-button mic " + (recording ? "recording" : "")}
                aria-label={
                  voicePhase === "transcribing" ? "Cancel transcription" : recording ? "Finish recording" : "Start voice input"
                }
                aria-pressed={recording}
                onClick={mic}
                disabled={busy || loading || historyError}
              >
                {voicePhase === "transcribing" ? <X size={18} /> : recording ? <AudioLines size={19} /> : <Mic size={20} />}
              </button>
              <button
                type="submit"
                className="send-button"
                aria-label="Send message"
                disabled={(!input.trim() && !recording) || busy || voicePhase === "connecting" || voicePhase === "transcribing" || loading || historyError}
              >
                <ArrowUp size={20} />
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
