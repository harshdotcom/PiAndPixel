import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";

/** A collapsible Inspector section with an uppercase title (Premiere's Properties groups). */
export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  const [open, setOpen] = useState(true);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <section aria-label={title} className="border-b border-line">
      <div className="flex h-7 items-center pr-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex h-full flex-1 items-center gap-1 pl-2 text-fg-2 hover:text-fg"
        >
          <Chevron size={14} strokeWidth={1.75} aria-hidden />
          <span className="panel-title">{title}</span>
        </button>
        {aside}
      </div>
      {open && <div className="anim-fade space-y-2.5 px-3 pt-0.5 pb-3">{children}</div>}
    </section>
  );
}

/** One "label  value" line. */
export function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-[20px] items-baseline gap-3 text-sm">
      <span className="w-[76px] shrink-0 text-fg-2">{label}</span>
      <span className="tabular min-w-0 flex-1 break-words text-fg">{children}</span>
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-fg-3">{children}</p>;
}
