'use client';

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

const CONTROL =
  'w-full rounded-lg border border-line bg-raised px-3 py-2 sm:text-sm text-text ' +
  'placeholder:text-muted/70 transition-colors duration-150 ' +
  'hover:border-muted/50 focus:border-accent focus:outline-none ' +
  'disabled:cursor-not-allowed disabled:opacity-60';

interface Common {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Common>(
  function Input({ label, hint, error, className, id, ...rest }, ref) {
    const auto = useId();
    const fieldId = id ?? auto;
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={fieldId} className="text-sm font-medium text-text">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? `${fieldId}-msg` : undefined}
          className={cn(CONTROL, error && 'border-danger', className)}
          {...rest}
        />
        {(error || hint) && (
          <p id={`${fieldId}-msg`} className={cn('text-xs', error ? 'text-danger' : 'text-muted')}>
            {error ?? hint}
          </p>
        )}
      </div>
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & Common
>(function Textarea({ label, hint, error, className, id, ...rest }, ref) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={fieldId} className="text-sm font-medium text-text">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, 'resize-y leading-relaxed', error && 'border-danger', className)}
        {...rest}
      />
      {(error || hint) && (
        <p className={cn('text-xs', error ? 'text-danger' : 'text-muted')}>{error ?? hint}</p>
      )}
    </div>
  );
});
