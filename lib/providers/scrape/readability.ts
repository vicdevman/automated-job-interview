import 'server-only';
import { lookup } from 'node:dns/promises';
import type { ScrapeProvider, ScrapedPage } from './types';
import { ProviderError } from '../errors';
import { env } from '@/lib/env';

/**
 * PRD §3.2 + §8.6 — self-hosted scraper.
 *
 * The security requirements here are not decoration. This endpoint takes a URL
 * from an unauthenticated-ish user and fetches it from inside our
 * infrastructure, which is the textbook SSRF setup. Controls implemented:
 *
 *   - scheme allowlist (http/https only — no file:, gopher:, data:)
 *   - DNS resolution followed by a private-range check, so a hostname that
 *     resolves to 169.254.169.254 or 10.x is refused
 *   - redirects followed manually, re-validating the destination each hop,
 *     because a public URL can 302 to a private one
 *   - hard timeout and response size cap
 *   - robots.txt honoured
 */

const MAX_REDIRECTS = 3;

export class ScrapeRejected extends Error {
  constructor(
    message: string,
    readonly code: 'scheme' | 'private-address' | 'robots' | 'timeout' | 'too-large' | 'not-html' | 'unreachable',
  ) {
    super(message);
    this.name = 'ScrapeRejected';
  }
}

/** IPv4/IPv6 ranges that must never be reachable from a user-supplied URL. */
export function isPrivateAddress(ip: string): boolean {
  // IPv6
  if (ip.includes(':')) {
    const v6 = ip.toLowerCase();
    if (v6 === '::1' || v6 === '::') return true;
    // Unique-local and link-local.
    if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true;
    if (/^fe[89ab][0-9a-f]:/.test(v6)) return true;
    // IPv4-mapped — unwrap and check as IPv4.
    const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped?.[1]) return isPrivateAddress(mapped[1]);
    return false;
  }

  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a = 0, b = 0] = parts;

  if (a === 0) return true; // "this network"
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

/** Validates the scheme, then resolves DNS and rejects private destinations. */
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ScrapeRejected('That is not a valid URL.', 'scheme');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ScrapeRejected('Only http and https URLs can be fetched.', 'scheme');
  }

  let addresses;
  try {
    addresses = await lookup(url.hostname, { all: true });
  } catch {
    throw new ScrapeRejected(`Could not resolve ${url.hostname}.`, 'unreachable');
  }

  // Every resolved address must be public — one private answer is enough to
  // refuse, since we cannot control which the HTTP client picks.
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) {
      throw new ScrapeRejected(
        `${url.hostname} resolves to a private address and cannot be fetched.`,
        'private-address',
      );
    }
  }

  return url;
}

async function allowedByRobots(url: URL, signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(new URL('/robots.txt', url.origin), {
      signal,
      redirect: 'follow',
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!response.ok) return true; // No robots.txt means no restriction.

    const body = (await response.text()).slice(0, 100_000);
    const path = url.pathname + url.search;

    // Only the wildcard group applies to us; a named agent group does not.
    let inWildcard = false;
    let disallowed = false;
    for (const line of body.split('\n')) {
      const clean = line.split('#')[0]?.trim() ?? '';
      if (!clean) continue;
      const [rawKey, ...rest] = clean.split(':');
      const key = rawKey?.trim().toLowerCase();
      const value = rest.join(':').trim();

      if (key === 'user-agent') {
        inWildcard = value === '*';
      } else if (inWildcard && key === 'disallow' && value) {
        if (path.startsWith(value)) disallowed = true;
      } else if (inWildcard && key === 'allow' && value && path.startsWith(value)) {
        disallowed = false;
      }
    }
    return !disallowed;
  } catch {
    // A missing or unreachable robots.txt must not block a legitimate fetch.
    return true;
  }
}

const USER_AGENT =
  'InterviewSimulatorBot/1.0 (candidate-supplied URL fetch; respects robots.txt)';

/** Follows redirects by hand so every hop is re-validated against SSRF rules. */
async function fetchWithValidation(
  startUrl: URL,
  signal: AbortSignal,
): Promise<{ response: Response; finalUrl: URL }> {
  let url = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(url, {
      signal,
      redirect: 'manual',
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) break;
      // A public host redirecting to 169.254.169.254 is the classic bypass.
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }

    return { response, finalUrl: url };
  }

  throw new ScrapeRejected('Too many redirects.', 'unreachable');
}

export const readabilityScrape: ScrapeProvider = {
  id: 'readability',

  async fetchPage({ url: raw }): Promise<ScrapedPage> {
    const url = await assertPublicUrl(raw);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), env.SCRAPE_TIMEOUT_MS);

    try {
      if (!(await allowedByRobots(url, controller.signal))) {
        throw new ScrapeRejected('That site’s robots.txt disallows fetching this page.', 'robots');
      }

      const { response, finalUrl } = await fetchWithValidation(url, controller.signal);

      if (!response.ok) {
        throw new ProviderError('readability', response.status, `Could not fetch ${finalUrl.hostname}.`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('html') && !contentType.includes('text/plain')) {
        throw new ScrapeRejected(
          `That URL returned ${contentType || 'an unknown type'}, not a web page.`,
          'not-html',
        );
      }

      // Size cap enforced while reading, so a hostile server cannot stream us
      // gigabytes just because it omitted content-length.
      const declared = Number(response.headers.get('content-length') ?? 0);
      if (declared > env.SCRAPE_MAX_BYTES) {
        throw new ScrapeRejected('That page is too large to process.', 'too-large');
      }

      const html = await readCapped(response, env.SCRAPE_MAX_BYTES);
      const { title, text, truncated } = await extractReadable(html, finalUrl.toString());

      return {
        url: finalUrl.toString(),
        title,
        text,
        fetchedAt: Date.now(),
        truncated: truncated || html.length >= env.SCRAPE_MAX_BYTES,
      };
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new ScrapeRejected(
          `That page took longer than ${env.SCRAPE_TIMEOUT_MS / 1000}s to respond.`,
          'timeout',
        );
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  },
};

async function readCapped(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  void reader.cancel().catch(() => {});

  return new TextDecoder('utf-8', { fatal: false }).decode(
    Buffer.concat(chunks.map((c) => Buffer.from(c))).subarray(0, maxBytes),
  );
}

/** Readability strips nav, ads and boilerplate so the LLM sees the article. */
async function extractReadable(
  html: string,
  url: string,
): Promise<{ title: string; text: string; truncated: boolean }> {
  const { parseHTML } = await import('linkedom');
  const { Readability } = await import('@mozilla/readability');

  const { document } = parseHTML(html);
  const fallbackTitle = document.querySelector('title')?.textContent?.trim() ?? url;

  try {
    const article = new Readability(document as unknown as Document).parse();
    if (article?.textContent && article.textContent.trim().length > 200) {
      return {
        title: article.title?.trim() || fallbackTitle,
        text: collapse(article.textContent),
        truncated: false,
      };
    }
  } catch {
    // Readability throws on some malformed documents; fall through.
  }

  // Fallback: strip script/style and take the body text.
  document.querySelectorAll('script, style, nav, footer, noscript').forEach((el) => el.remove());
  const body = document.querySelector('body')?.textContent ?? '';
  return { title: fallbackTitle, text: collapse(body), truncated: false };
}

function collapse(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
