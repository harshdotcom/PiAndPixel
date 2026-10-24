import type { ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Visible label, also the accessible name. */
  label: string;
  children: ReactNode;
  /** Hide the label text (it still names the select). */
  hideLabel?: boolean;
  width?: number | string;
  /** 22px tall, for panel headers. */
  small?: boolean;
}

export const fieldClass =
  "h-[26px] rounded-[4px] border border-line bg-raised px-2 text-sm text-fg outline-none transition-colors duration-[80ms] hover:border-line-strong focus:border-accent disabled:opacity-40";

/** A native select styled like the other controls, with a label beside it. */
export function Select({ label, hideLabel, width, small, className = "", children, ...rest }: Props) {
  return (
    <label className={`flex min-w-0 items-center gap-1.5 text-xs text-fg-2 ${className}`}>
      <span className={hideLabel ? "sr-only" : "shrink-0"}>{label}</span>
      <span className="relative min-w-0" style={{ width }}>
        <select className={`${fieldClass} w-full appearance-none truncate pr-6 tabular ${small ? "h-[22px] text-xs" : ""}`} {...rest}>
          {children}
        </select>
        <ChevronDown
          size={12}
          strokeWidth={2}
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-1.5 -translate-y-1/2 text-fg-3"
        />
      </span>
    </label>
  );
}
