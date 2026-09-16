/** PRD §3.2 — Search contract. Used only for company/role research (§5.4). */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  readonly id: string;
  search(req: { query: string; maxResults?: number }): Promise<{ results: SearchResult[] }>;
}
