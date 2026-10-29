# Voice capture — 1.0.7

The assistant now records the complete utterance locally and submits the completed audio to OpenAI `gpt-transcribe` through the official Node SDK. The former WebRTC path remains only as a compatibility endpoint for older clients. The new interface does not depend on a live connection while the person is speaking.

## Why the previous flow was fragile

The microphone was opened before a network/session handshake, and the client stopped on the first completed transcription event. There was no retained recording for playback or retry. Stopping also stopped the audio track before committing the provider buffer. These were plausible ways to lose speech or final words; the user's specific device recording was not available for acoustic diagnosis.

## Current behavior

- Immediate local recording after permission, with an explicit Finish control. Pauses do not end the utterance.
- Preferred mono 48 kHz capture, echo cancellation, noise suppression and automatic gain control; 256 kbps Opus/WebM, or MP4 where supported. Constraints are browser/device preferences, not proof of actual hardware settings.
- System-default microphone and automatic language detection. A two-minute safety cap runs internally; no settings, timer or progress meter are shown.
- Wait for the final MediaRecorder chunk before releasing the microphone.
- Complete-file transcription with `gpt-transcribe`; no cheaper silent fallback.
- Limited domain vocabulary, plus names/product codes from the authorized selected case. No proposed answer or recovery quantities are supplied as hints.
- Retained recording on failure, with a small Retry transcription control. No playback panel is shown. Audio stays in page memory until success, cancellation, a new recording or navigation; it is not written to browser storage or the application server's filesystem.
- Tapping the mic again transcribes into the editable draft. Tapping Send while recording stops capture, waits for transcription, combines it with any typed draft and submits the message to the assistant once. No business action is executed automatically.
- Sending and duplicate recording are blocked while transcribing; cancellation prevents late results entering another case.

The application uploads audio to its authenticated backend, which forwards it to OpenAI. This describes application storage behavior, not a claim about the provider's data-retention policy.

## API

`POST /api/v1/voice/transcribe?runId=<uuid>&caseId=<uuid>&language=auto`

The body is binary audio, with its audio MIME type. Supported application types: WebM, MP4, WAV. Maximum body: 8 MiB, aligned with the nginx limit. The route checks membership, permitted role, cookie origin, current run and case access before calling the provider; it rechecks the run afterward. The provider request is outside the database transaction/tenant lock. No schema migration is required.

`OPENAI_TRANSCRIPTION_MODEL` defaults to `gpt-transcribe`. The API key stays server-side. Configuration passes through Compose. Existing `/api/v1/voice/session` is retained for older APKs, so reinstall the new APK to use the improved flow there.

## Verification

`pnpm test` passed 34 tests during the upgrade. New tests cover final-chunk flushing, pauses, cancellation during permission/upload, retry, MP4 selection, duration limit, draft preservation and composer locking. Build and Android assembly succeeded.

`scripts/verify-voice-quality.ts` submits synthetic fixtures to the actual provider. The successful run checked short domain speech, synthetic Indian English, the same audio with seeded noise at 10 dB whole-file SNR, a four-second pause and silence. The number/negation checks include 3,000 units, 1,200 versus 12,000 euros, and “do not approve.” Results and transcripts are in `outputs/voice-quality-verification.json`.

An initial vocabulary hint caused “stock gap” to become “stockout.” Removing that unnecessary hint and using a short contextual prompt corrected the sample. This is evidence to keep hint lists narrow, not proof that any ASR model is error-free.

`scripts/verify-voice-http.mjs` checks the full application route, including authentication, origin, tenant, stale run, missing case, invalid language, empty/non-audio bodies and a 1.38 MB noisy WAV. It does not reset or mutate business data. It uses API calls and may incur provider charges. Pass a private env file and target URL for remote verification.

Physical microphones, Bluetooth routing, real human accents and meeting-room acoustics still require testing on the user's device. Synthetic/browser tests cannot certify them.

## Rehearsal

1. Reload the web/PWA or install APK 1.0.7 (versionCode 8).
2. Open the intended case, tap the mic and allow permission if requested.
3. Speak naturally, then tap Send to stop, transcribe and send the message to the chat.
4. To transcribe into the draft without sending, tap the mic again instead.
5. If transcription fails, use the inline retry. While transcribing, the mic control becomes Cancel.

Official references, checked 10 September 2026:

- https://developers.openai.com/api/docs/guides/speech-to-text
- https://developers.openai.com/api/docs/models/gpt-transcribe
- https://developers.openai.com/api/docs/guides/realtime-transcription

Deployed verification completed: the public HTTPS route passed all nine HTTP checks, and a live browser captured a controlled paused speech stream through MediaRecorder, returned the full transcript and exposed playback/manual send. A simulated upload failure preserved the draft and audio and succeeded on retry. See `outputs/voice-upgrade-verification.json`. The Chromium file-based fake mic produced silence, so browser audio was explicitly injected; no physical microphone claim is made.

The generated provider-test fixtures live under `.local/voice-eval` and are not bundled as user recordings. The quality script expects these fixtures; the normal `pnpm test` suite uses self-contained mocks and database fixtures.

## UI simplification — 1.0.7

Removed microphone/language selectors, level meter, elapsed timer, audio player and separate recording panel at the user's request. Defaults and the high-accuracy transcription path are unchanged. Normal UI consists of mic/finish, a brief status and send; retry is visible only after failure. Typecheck and 18 focused interaction/capture tests passed, including send-while-recording, cancellation and retry without duplicate submission.
