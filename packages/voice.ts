// Shared browser/API limits. Two minutes of 256 kbps audio fits below this cap.
export const MAX_VOICE_BYTES = 8 * 1024 * 1024;
export const MAX_VOICE_SECONDS = 120;
export const voiceLanguages = ["auto", "en", "hi", "fr", "de", "es", "nl"] as const;
export type VoiceLanguage = typeof voiceLanguages[number];
export const voiceMimeTypes = ["audio/webm", "audio/mp4", "audio/wav", "audio/x-wav"];
export function voiceExtension(mime: string) {
  return ({ "audio/webm": "webm", "audio/mp4": "m4a", "audio/wav": "wav", "audio/x-wav": "wav" } as Record<string, string>)[mime.split(";")[0].trim().toLowerCase()];
}
