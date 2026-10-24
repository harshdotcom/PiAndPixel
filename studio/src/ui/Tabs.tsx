import type { KeyboardEvent, ReactNode } from "react";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  /** Accessible name when the label is not plain text. */
  name?: string;
}

interface Props<T extends string> {
  label: string;
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** "header": panel-header tabs (uppercase titles); "pill": compact tabs inside a panel. */
  variant?: "header" | "pill";
  /** Extra content after a tab, e.g. a close button. */
  after?: (id: T) => ReactNode;
}

const STYLES = {
  header: {
    list: "flex h-full min-w-0 items-stretch",
    tab: "panel-title flex items-center px-2.5 border-b-2 -mb-px",
    on: "border-accent text-fg",
    off: "border-transparent text-fg-3 hover:text-fg-2",
  },
  pill: {
    list: "flex min-w-0 items-center gap-0.5",
    tab: "flex h-[22px] items-center rounded-[4px] px-2 text-sm",
    on: "bg-accent-weak text-fg",
    off: "text-fg-2 hover:bg-raised hover:text-fg",
  },
};

/** A row of tabs (WAI-ARIA tablist); arrow keys move between them. */
export function Tabs<T extends string>({ label, items, value, onChange, variant = "pill", after }: Props<T>) {
  const style = STYLES[variant];
  function onKeyDown(e: KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const next = items[(index + (e.key === "ArrowRight" ? 1 : -1) + items.length) % items.length];
    if (next) onChange(next.id);
  }
  return (
    <div role="tablist" aria-label={label} className={style.list}>
      {items.map((item, i) => (
        <div key={item.id} className="flex min-w-0 items-stretch">
          <button
            type="button"
            role="tab"
            aria-selected={item.id === value}
            aria-label={item.name}
            tabIndex={item.id === value ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`press truncate ${style.tab} ${item.id === value ? style.on : style.off}`}
          >
            {item.label}
          </button>
          {after?.(item.id)}
        </div>
      ))}
    </div>
  );
}
