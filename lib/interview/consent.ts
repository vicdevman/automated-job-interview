/**
 * PRD §8.4 — consent is timestamped AND versioned on the session, so if the
 * wording of what we capture ever changes, old sessions still record which
 * text the candidate actually agreed to.
 *
 * Bump this whenever the copy below changes.
 */
export const CONSENT_VERSION = '2026-09-1';

export const CONSENT_SCOPE = ['microphone', 'transcript-storage', 'llm-evaluation'] as const;

/** The plain-language copy shown beside the checkbox on the setup screen. */
export const CONSENT_COPY = {
  heading: 'Before we start',
  points: [
    'Your microphone is used only while you are answering, and you can stop at any time.',
    'Your speech is streamed to a transcription service and converted to text. The audio itself is never saved, not by us, not anywhere.',
    'Only the text of your answers is stored, encrypted, so your results can be scored and shown back to you.',
    'Your answers are sent to a language model to be scored. They are not used to train it.',
    'Transcripts are deleted automatically after 90 days, and you can delete everything yourself at any time.',
  ],
  agree: 'I understand and agree to be recorded and scored on this basis.',
} as const;
