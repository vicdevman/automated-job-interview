/**
 * The mark used in every header (landing, app, interviewer). Pulled out of
 * the landing page component because a page file may only export the names
 * Next's App Router recognises (default, metadata, generateStaticParams,
 * …) — exporting an extra component from it breaks that contract.
 */
export function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="size-6 text-accent" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
      <path d="M8 10v4M12 7v10M16 10v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
