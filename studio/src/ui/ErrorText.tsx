import { CircleAlert } from "lucide-react";
import type { ReactNode } from "react";

/** An inline error in --record, never a raw JSON dump (the message is the Agent's text). */
export function ErrorText({ error, className = "" }: { error: Error; className?: string }) {
  return (
    <p role="alert" className={`flex items-start gap-1.5 text-sm text-record ${className}`}>
      <CircleAlert size={14} strokeWidth={1.75} className="mt-px shrink-0" aria-hidden />
      <span className="min-w-0 break-words">{error.message}</span>
    </p>
  );
}

/** A centred hint for an empty panel or list. */
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="flex h-full min-h-16 flex-col items-center justify-center gap-2 p-4 text-center text-sm text-fg-3">{children}</div>;
}
