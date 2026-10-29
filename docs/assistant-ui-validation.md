# Assistant UI release 1.0.4

The chat panel and assistant reply previously shared `.assistant`. The page-level panel height rules therefore also applied to every assistant message, creating roughly 550-pixel reply blocks even for short responses. The panel now uses `.assistant-panel`; message bubbles keep their own content-driven sizing.

The conversation scrolls inside its own container, preserving the page position. When a user scrolls up to read older messages, incoming replies do not move their reading position; a Jump to latest control returns to the newest message. Existing conversations omit the empty welcome block. Reply text wraps long content; the composer remains outside the scroll area.

History has explicit loading/error/retry states, and sending is disabled until history loads. Chat state is isolated by case and demo run, preventing a late response from entering a different case. Failed sends restore the draft. Shift+Enter and IME composition do not submit. Prepared-action buttons still open the review flow.

Automated validation: 21 checks covering the assistant lifecycle and interactions, session handling, diagnostics and inventory calculations. Android build 1.0.4 (version code 5) uses the same UI changes. Physical-device microphone capture and push delivery are not asserted by these UI tests.

Live verification: existing replies shrank from about 550 pixels to 155 pixels; a new two-bullet reply measured 111 pixels. Desktop and phone widths showed content-sized bubbles and no horizontal overflow. A real assistant request completed, page scroll remained at zero, case switching restored the correct history, and no new browser errors were observed.
