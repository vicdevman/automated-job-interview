import 'server-only';
import { env } from '@/lib/env';
import type { SttTokenIssuer, SttBatchProvider } from './stt/types';
import type { TtsProvider } from './tts/types';
import type { LlmProvider } from './llm/types';
import type { SearchProvider } from './search/types';
import type { ScrapeProvider } from './scrape/types';

import { speechmaticsIssuer } from './stt/speechmatics.server';
import { whisperBatch } from './stt/whisper.batch';
import { speechmaticsTts } from './tts/speechmatics';
import { groqLlm } from './llm/groq';
import { geminiLlm } from './llm/gemini';
import { tavilySearch } from './search/tavily';
import { readabilityScrape } from './scrape/readability';

/**
 * PRD §3.2 — the swap surface.
 *
 * Adding a provider is exactly four steps and nothing else:
 *   1. write the adapter file implementing the interface
 *   2. add one line to the map below
 *   3. set the env var
 *   4. extend the zod schema in lib/env.ts
 *
 * No file under app/, components/, or lib/interview/ may import a vendor SDK.
 */

const STT_ISSUERS: Record<string, SttTokenIssuer> = { speechmatics: speechmaticsIssuer };
const STT_BATCH: Record<string, SttBatchProvider> = { whisper: whisperBatch };
const TTS: Record<string, TtsProvider> = { speechmatics: speechmaticsTts };
const LLM: Record<string, LlmProvider> = { groq: groqLlm, gemini: geminiLlm };
const SEARCH: Record<string, SearchProvider> = { tavily: tavilySearch };
const SCRAPE: Record<string, ScrapeProvider> = { readability: readabilityScrape };

function pick<T>(map: Record<string, T>, key: string | undefined, kind: string): T {
  const chosen = map[key ?? ''];
  if (!chosen) {
    throw new Error(
      `Unknown ${kind} provider "${key}". Available: ${Object.keys(map).join(', ')}`,
    );
  }
  return chosen;
}

export const sttIssuer = () => pick(STT_ISSUERS, env.STT_PROVIDER, 'STT');
export const sttBatch = () => pick(STT_BATCH, env.STT_BATCH_PROVIDER, 'STT batch');
export const tts = () => pick(TTS, env.TTS_PROVIDER, 'TTS');
export const llm = () => pick(LLM, env.LLM_PROVIDER, 'LLM');
export const search = () => pick(SEARCH, env.SEARCH_PROVIDER, 'Search');
export const scraper = () => pick(SCRAPE, env.SCRAPE_PROVIDER, 'Scrape');

/** Exposed so the interviewer console can show what is currently wired up. */
export function providerInventory() {
  return {
    stt: { selected: env.STT_PROVIDER, available: Object.keys(STT_ISSUERS) },
    sttBatch: { selected: env.STT_BATCH_PROVIDER, available: Object.keys(STT_BATCH) },
    tts: { selected: env.TTS_PROVIDER, available: Object.keys(TTS) },
    llm: { selected: env.LLM_PROVIDER, available: Object.keys(LLM) },
    search: { selected: env.SEARCH_PROVIDER, available: Object.keys(SEARCH) },
    scrape: { selected: env.SCRAPE_PROVIDER, available: Object.keys(SCRAPE) },
  };
}
