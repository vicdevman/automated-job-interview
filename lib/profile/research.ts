import 'server-only';
import { scraper, search } from '@/lib/providers/registry';

/**
 * PRD §5.4 — company and role research.
 *
 * Strictly additive context. Every failure path here degrades to "no company
 * context" rather than failing the session: a candidate should never be blocked
 * from interviewing because a company website was slow.
 *
 * Results are cached in-process for 7 days per PRD §5.4 ("never re-scrape
 * mid-session"). A module-level cache is the right scope on Vercel — it is
 * per-instance and short-lived, which is what the requirement is actually
 * protecting against.
 */

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PAGES = 3;
const MAX_TEXT_PER_PAGE = 8_000;

interface CacheEntry {
  at: number;
  value: CompanyResearch;
}

const cache = new Map<string, CacheEntry>();

export interface CompanyResearch {
  name: string;
  /** Concatenated page text. Always treated as untrusted data in prompts. */
  text: string;
  sources: Array<{ url: string; title: string }>;
  degraded: boolean;
  notes: string[];
}

export async function researchCompany(input: {
  companyName: string;
  roleTitle: string;
  directUrls?: string[];
}): Promise<CompanyResearch> {
  const key = `${input.companyName.toLowerCase()}::${input.roleTitle.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const notes: string[] = [];
  const urls: string[] = [...(input.directUrls ?? [])];

  // 1. search, capped at 5 results (PRD §5.4)
  if (urls.length < MAX_PAGES) {
    try {
      const { results } = await search().search({
        query: `${input.companyName} ${input.roleTitle} company overview`,
        maxResults: 5,
      });
      // Scrape the top 2 plus anything the candidate supplied directly.
      for (const r of results.slice(0, 2)) {
        if (!urls.includes(r.url)) urls.push(r.url);
      }
    } catch (e) {
      notes.push(`search unavailable: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 2. scrape
  const sources: CompanyResearch['sources'] = [];
  const parts: string[] = [];

  for (const url of urls.slice(0, MAX_PAGES)) {
    try {
      const page = await scraper().fetchPage({ url });
      if (page.text.trim().length < 200) {
        notes.push(`${url} had too little content to use`);
        continue;
      }
      sources.push({ url: page.url, title: page.title });
      parts.push(`# ${page.title}\n(${page.url})\n\n${page.text.slice(0, MAX_TEXT_PER_PAGE)}`);
    } catch (e) {
      notes.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  const value: CompanyResearch = {
    name: input.companyName,
    text: parts.join('\n\n---\n\n'),
    sources,
    degraded: parts.length === 0,
    notes,
  };

  // Only cache a useful result — caching a failure for 7 days would be perverse.
  if (!value.degraded) cache.set(key, { at: Date.now(), value });

  return value;
}

/** Fetches one candidate-supplied URL. Throws so the caller can show the reason. */
export async function fetchCandidateUrl(url: string) {
  return scraper().fetchPage({ url });
}
