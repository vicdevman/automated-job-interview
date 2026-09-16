import type { Metadata } from 'next';
import { VoiceLab } from './VoiceLab';

export const metadata: Metadata = { title: 'Voice lab' };

/**
 * PRD §14, Phase 2 — the isolation harness.
 *
 * Two buttons and nothing else. 80% of the debugging in this project lives in
 * the audio path, so it gets proven standalone before interview logic can hide
 * a failure behind it. This page is not linked from anywhere in the product.
 */
export default function VoiceDevPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-12">
      <p className="text-sm font-medium text-accent">Development only</p>
      <h1 className="mt-2 text-[1.75rem] font-semibold tracking-tight">Voice lab</h1>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
        Exercises the text-to-speech and speech-to-text paths on their own, with no interview logic
        attached. If something is broken in a real interview, check here first.
      </p>
      <div className="mt-10">
        <VoiceLab />
      </div>
    </div>
  );
}
