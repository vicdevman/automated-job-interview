/** PRD §3.2 — Scrape contract. Implementations must honour the SSRF and size rules in §8.6. */
export interface ScrapedPage {
  url: string;
  title: string;
  /** Main content with boilerplate stripped. Always treated as untrusted data, never instructions. */
  text: string;
  fetchedAt: number;
  truncated: boolean;
}

export interface ScrapeProvider {
  readonly id: string;
  fetchPage(req: { url: string }): Promise<ScrapedPage>;
}
