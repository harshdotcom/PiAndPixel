# ADR-0007: Narration, word timing and social export

**Status:** Accepted
**Date:** 2026-10-28

## Context

Creators need an optional voice-over workflow for finished Manim compositions. A draft script, generated narration, accurately timed captions, and final vertical export are related but separate artifacts. Editing narration should not cause expensive scene renders to run again.

The existing portrait format is 1080×1920 at 30 fps. `pnp_core.compose` currently concatenates video only. Deepgram Aura TTS returns synthesized audio; it does not include per-word timing in its documented response. Deepgram's prerecorded speech-to-text response includes word start/end times, so timing must be measured from the generated audio in a separate request.

## Decision

1. Keep narration opt-in and attach editable narration segments to composition clips.
2. Use OpenAI Responses to draft a script only from context the creator selects. Require human review before synthesis. Also support creator-written scripts without OpenAI.
3. Use Deepgram TTS to synthesize approved text. Store each audio segment and its source text as project assets.
4. Run Deepgram speech-to-text on generated audio to obtain observed word timings. Align these results to approved text, retain confidence, and surface uncertain or unmatched words for manual correction. Never claim automatic timing is exact when confidence is low.
5. Export optional WebVTT/SRT captions; allow timing and text edits in the Studio before the final render. Burned-in captions remain optional.
6. Mix voice-over and optional music in the final FFmpeg composite step. Changes to audio, transcript, or caption style invalidate composite artifacts only; they do not invalidate Manim render units.
7. Keep provider calls in the Agent. Read `OPENAI_API_KEY` and `DEEPGRAM_API_KEY` from the Agent process environment; never expose or persist them in browser state, project files, subprocess environments, or logs. Make each paid provider call explicit and user initiated.
8. Add a shared vertical social delivery profile at 9:16, 1080×1920, 30 fps, with a three-minute cross-post cap. Keep platform-specific validation and safe zones configurable because platform requirements may change.

## Consequences

- Script generation, speech synthesis, alignment, manual correction, caption export, and audio mixing must be separate, retryable stages.
- Word timestamps are measurements of the generated voice, not predictions from the source text. Pronunciation differences can still require creator correction.
- Voice and caption edits can be recomposited without rerunning Manim, reducing cost and iteration time.
- Provider credentials and usage costs need local setup guidance and visible per-action confirmation.

## References

- [Deepgram Text-to-Speech response](https://developers.deepgram.com/docs/tts-container)
- [Deepgram prerecorded speech-to-text word timings](https://developers.deepgram.com/docs/pre-recorded-audio)
- [YouTube Shorts length and aspect-ratio eligibility](https://support.google.com/youtube/answer/15424877)
- [Meta Reels creative guidance](https://assets.ctfassets.net/bx4f6dhogdf5/1lPTvRiUsLblOR7mzwmtVH/60690784ef747af8368ec78395fa168d/KPM_META_Guidelines_Final_10.24.pdf)
