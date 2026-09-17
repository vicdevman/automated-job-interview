'use client';

/**
 * The little pull-tab shown when the header has slid away — the "there is
 * more chrome, tap to bring it back" affordance from a call UI's hidden
 * status bar. Centered, small, unobtrusive.
 */
export function HeaderNotch({ visible, onReveal }: { visible: boolean; onReveal: () => void }) {
  return (
    <button
      type="button"
      onClick={onReveal}
      aria-label="Show navigation"
      tabIndex={visible ? 0 : -1}
      className={`fixed inset-x-0 top-0 z-50 mx-auto flex h-6 w-16 items-center justify-center
        rounded-b-2xl border border-t-0 border-line bg-raised/95 backdrop-blur-md
        shadow-sm transition-all duration-300 ease-out
        ${visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'}`}
    >
      <span className="h-1 w-8 rounded-full bg-muted/50" aria-hidden="true" />
    </button>
  );
}
