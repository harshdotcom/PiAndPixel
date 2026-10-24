import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { Tooltip } from "./Tooltip";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BASE =
  "press inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[4px] px-2.5 text-sm font-medium whitespace-nowrap select-none disabled:pointer-events-none disabled:opacity-40";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "h-7 bg-accent px-3 font-semibold text-sunken hover:bg-[#6fd0e6]",
  secondary: "h-[26px] border border-line bg-raised text-fg hover:border-line-strong hover:bg-[#323744]",
  ghost: "h-[26px] text-fg-2 hover:bg-raised hover:text-fg",
  danger: "h-[26px] border border-record/40 text-record hover:bg-record/10",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: LucideIcon;
}

export function Button({ variant = "secondary", icon: Icon, className = "", children, ...rest }: ButtonProps) {
  return (
    <button type="button" className={`${BASE} ${VARIANTS[variant]} ${className}`} {...rest}>
      {Icon && <Icon size={14} strokeWidth={1.75} aria-hidden />}
      {children}
    </button>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  /** Pressed / toggled on: the icon is shown in the accent colour. */
  active?: boolean;
  tooltipSide?: "top" | "bottom" | "right" | "left";
}

/** 24×24 button with a 16px lucide icon and a tooltip naming it (and its shortcut). */
export function IconButton(props: IconButtonProps) {
  const { icon: Icon, label, shortcut, active, tooltipSide = "bottom", className = "", ...rest } = props;
  return (
    <Tooltip label={label} shortcut={shortcut} side={tooltipSide}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        className={`press inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] hover:bg-raised disabled:pointer-events-none disabled:opacity-40 ${
          active ? "text-accent" : "text-fg-2 hover:text-fg"
        } ${className}`}
        {...rest}
      >
        <Icon size={16} strokeWidth={1.75} aria-hidden />
      </button>
    </Tooltip>
  );
}
