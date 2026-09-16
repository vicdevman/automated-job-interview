import 'server-only';
import type { SearchProvider, SearchResult } from './types';
import { ProviderError } from '../errors';
import { requireEnv } from '@/lib/env';

/**
 * PRD §5.4 — company/role research. Used only to add company context to
 * questions, and strictly additive: a failed search degrades to generic
 * questions rather than erroring the session.
 */

interface TavilyResponse {
  results?: Array<{ title?: string; url?: string; content?: string }>;
  error?: string;
}

export const tavilySearch: SearchProvider = {
  id: 'tavily',

  async search({ query, maxResults = 5 }): Promise<{ results: SearchResult[] }> {
    const apiKey = requireEnv('TAVILY_API_KEY');

    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        max_results: Math.min(Math.max(maxResults, 1), 10),
        search_depth: 'basic',
        include_answer: false,
        include_raw_content: false,
      }),
      cache: 'no-store',
    });

    const body = (await response.json().catch(() => ({}))) as TavilyResponse;

    if (!response.ok) {
      throw new ProviderError('tavily', response.status, body.error ?? 'Search request failed.');
    }

    return {
      results: (body.results ?? [])
        .filter((r): r is { title: string; url: string; content: string } =>
          Boolean(r.url && r.title),
        )
        .map((r) => ({ title: r.title, url: r.url, snippet: r.content ?? '' })),
    };
  },
};
