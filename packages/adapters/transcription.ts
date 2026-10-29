import OpenAI, { toFile } from "openai";
import { config } from "../config";
import { MAX_VOICE_BYTES, voiceExtension, type VoiceLanguage } from "../voice";

const vocabulary = ["Baxter", "Miebach", "Lyon", "Utrecht", "Rotterdam", "EMEA", "ETA", "SKU", "BOM", "demurrage", "detention"];
export const transcriptionContext = "A supply chain planner dictating a question about shipment delays, inventory and recovery.";
export function transcriptionKeywords(terms: unknown[] = []) {
  return [...new Set([...vocabulary, ...terms.filter((v): v is string => typeof v === "string")]
    .map(v => v.replace(/[<>\r\n]/g, " ").trim().slice(0, 80)).filter(Boolean))].slice(0, 40);
}

export async function transcribeRecording(audio: Buffer, mime: string, language: VoiceLanguage, terms: unknown[] = [], signal?: AbortSignal) {
  const extension = voiceExtension(mime);
  if (!extension || !audio.length || audio.length > MAX_VOICE_BYTES)
    throw Object.assign(new Error("Use a non-empty WebM, MP4 or WAV recording up to 8 MB."), { statusCode: 400 });
  if (!config.openaiKey) throw Object.assign(new Error("Transcription is not configured."), { statusCode: 503 });
  const client = new OpenAI({ apiKey: config.openaiKey, timeout: 60000, maxRetries: 1 });
  try {
    const result = await client.audio.transcriptions.create({
      model: config.transcriptionModel,
      file: await toFile(audio, `dictation.${extension}`, { type: mime.split(";")[0] }),
      prompt: transcriptionContext,
      keywords: transcriptionKeywords(terms),
      ...(language !== "auto" ? { languages: language === "hi" ? ["hi", "en"] : [language] } : {}),
    }, { signal });
    return { text: result.text.trim(), model: config.transcriptionModel, languages: result.languages || [] };
  } catch (error: any) {
    if (signal?.aborted) throw error;
    // Provider response bodies can contain user content: expose no raw provider error.
    throw Object.assign(new Error("Audio transcription failed."), { statusCode: 502 });
  }
}
