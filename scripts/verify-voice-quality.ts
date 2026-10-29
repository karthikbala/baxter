/** Synthetic recordings only. Makes billable transcription calls; never records a real microphone. */
import fs from "node:fs";
import OpenAI from "openai";
import { config } from "../packages/config";
import { transcriptionKeywords, transcriptionContext } from "../packages/adapters/transcription";
const client = new OpenAI({ apiKey: config.openaiKey, timeout: 90000, maxRetries: 1 });
const samples = [
  { name: "short-domain", path: ".local/voice-fixture.wav", terms: [/lyon/i, /utrecht/i, /stock gap/i] },
  { name: "indian-english", path: ".local/voice-eval/india.wav", terms: [/do not approve/i, /utrecht/i, /lyon/i, /(?:3,?000|three thousand)/i, /(?:1,?200|one thousand two hundred)/i, /not (?:12,?000|twelve thousand)/i, /demurrage/i] },
  { name: "indian-english-noise-10db", path: ".local/voice-eval/india-noisy.wav", terms: [/do not approve/i, /utrecht/i, /lyon/i, /(?:3,?000|three thousand)/i, /(?:1,?200|one thousand two hundred)/i, /not (?:12,?000|twelve thousand)/i, /demurrage/i] },
  { name: "long-pause", path: ".local/voice-eval/pause.wav", terms: [/lyon/i, /utrecht/i, /not approve/i] },
  { name: "silence", path: ".local/voice-eval/silence.wav", terms: [] },
];
const results = [];
for (const sample of samples) {
  const start = Date.now();
  const r = await client.audio.transcriptions.create({ model: config.transcriptionModel, file: fs.createReadStream(sample.path),
    keywords: transcriptionKeywords(),
    prompt: transcriptionContext });
  const checks = sample.terms.map(term => ({ term: term.source, passed: term.test(r.text) }));
  const passed = sample.name === "silence" ? !r.text.trim() : checks.every(c => c.passed);
  results.push({ name: sample.name, model: config.transcriptionModel, latencyMs: Date.now() - start, transcript: r.text, checks, passed });
  console.log(JSON.stringify(results.at(-1)));
}
fs.writeFileSync("outputs/voice-quality-verification.json", JSON.stringify({ date: new Date().toISOString(), scope: "Synthetic speech/audio fixtures, not physical microphone or human accent verification", results }, null, 2));
if (results.some(r => !r.passed)) process.exitCode = 1;
