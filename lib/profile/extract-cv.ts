import 'server-only';
import { env } from '@/lib/env';

/**
 * PRD §5.1 — CV file to plain text.
 *
 * PRD §8.6 requires magic-byte validation rather than trusting the file
 * extension or the browser-supplied MIME type, both of which an attacker
 * controls. A .pdf that is really a zip must be rejected before any parser
 * touches it.
 */

export type SupportedMime =
  | 'application/pdf'
  | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export class UploadRejected extends Error {
  constructor(
    message: string,
    readonly code: 'too-large' | 'empty' | 'unsupported-type' | 'unreadable' | 'no-text',
  ) {
    super(message);
    this.name = 'UploadRejected';
  }
}

/** Sniffs the real type from the leading bytes. */
export function detectType(bytes: Uint8Array): SupportedMime | null {
  // %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }
  // PK\x03\x04 — a zip container. DOCX is a zip; so are many other things, so
  // the parser still has to succeed before we accept it.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return null;
}

/**
 * Collapses the whitespace soup that PDF extraction produces while preserving
 * line structure, because the verbatim-quote check in grounding.ts normalises
 * whitespace the same way on both sides.
 */
function tidyExtractedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    // Ligatures that break word matching.
    .replace(/ﬁ/g, 'fi')
    .replace(/ﬂ/g, 'fl')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface ExtractedDocument {
  text: string;
  mimeType: SupportedMime;
  sizeBytes: number;
  pageCount?: number;
}

export async function extractDocument(
  file: { bytes: Uint8Array; filename: string },
): Promise<ExtractedDocument> {
  const sizeBytes = file.bytes.byteLength;

  if (sizeBytes === 0) {
    throw new UploadRejected('That file is empty.', 'empty');
  }
  if (sizeBytes > env.MAX_UPLOAD_BYTES) {
    const mb = (env.MAX_UPLOAD_BYTES / 1_048_576).toFixed(0);
    throw new UploadRejected(`That file is larger than ${mb} MB.`, 'too-large');
  }

  const mimeType = detectType(file.bytes);
  if (!mimeType) {
    throw new UploadRejected(
      'Only PDF and DOCX files are accepted. That file is neither.',
      'unsupported-type',
    );
  }

  let text: string;
  let pageCount: number | undefined;

  if (mimeType === 'application/pdf') {
    try {
      const { extractText, getDocumentProxy } = await import('unpdf');
      const pdf = await getDocumentProxy(file.bytes);
      const result = await extractText(pdf, { mergePages: true });
      text = Array.isArray(result.text) ? result.text.join('\n') : result.text;
      pageCount = result.totalPages;
    } catch (e) {
      throw new UploadRejected(
        `That PDF could not be read: ${e instanceof Error ? e.message : String(e)}`,
        'unreadable',
      );
    }
  } else {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: Buffer.from(file.bytes) });
      text = result.value;
    } catch (e) {
      throw new UploadRejected(
        `That DOCX could not be read: ${e instanceof Error ? e.message : String(e)}`,
        'unreadable',
      );
    }
  }

  const tidied = tidyExtractedText(text);

  // A scanned CV is an image with no text layer. Saying so is far better than
  // running extraction on an empty string and reporting "no facts found".
  if (tidied.length < 100) {
    throw new UploadRejected(
      mimeType === 'application/pdf'
        ? 'No readable text was found. If this is a scanned CV, the text cannot be extracted — paste a summary instead.'
        : 'No readable text was found in that document.',
      'no-text',
    );
  }

  return {
    text: tidied,
    mimeType,
    sizeBytes,
    ...(pageCount !== undefined ? { pageCount } : {}),
  };
}
