import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * Deliberately minimal (PRD §11.1): a hairline and a raised ground, no drop
 * shadow. Hierarchy is carried by spacing and type weight, so most content
 * should NOT be wrapped in this.
 */
export function Surface({
  children,
  className,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return <Tag className={cn('rounded-xl border border-line bg-raised', className)}>{children}</Tag>;
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'positive' | 'warn' | 'danger';
}) {
  const tones = {
    neutral: 'border-line text-muted',
    accent: 'border-accent/40 text-accent bg-accent-soft',
    positive: 'border-positive/40 text-positive bg-positive-soft',
    warn: 'border-warn/40 text-warn bg-warn-soft',
    danger: 'border-danger/40 text-danger bg-danger-soft',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}
