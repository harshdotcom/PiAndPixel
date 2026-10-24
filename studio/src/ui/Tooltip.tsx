import { useRef, useState, type CSSProperties, type ReactNode } from "react";

type Side = "top" | "bottom" | "right" | "left";

interface Props {
  label: string;
  shortcut?: string;
  side?: Side;
  children: ReactNode;
}

const DELAY_MS = 450;
const GAP = 6;
/** Minimum distance from the window edge. */
const EDGE = 4;

function place(rect: DOMRect, side: Side): CSSProperties {
  switch (side) {
    case "right":
      return { left: rect.right + GAP, top: rect.top + rect.height / 2, transform: "translateY(-50%)" };
    case "left":
      return { right: window.innerWidth - rect.left + GAP, top: rect.top + rect.height / 2, transform: "translateY(-50%)" };
    case "top":
      return { left: rect.left + rect.width / 2, bottom: window.innerHeight - rect.top + GAP, transform: "translateX(-50%)" };
    case "bottom":
      return { left: rect.left + rect.width / 2, top: rect.bottom + GAP, transform: "translateX(-50%)" };
  }
}

/** How far to move [start, end] so it sits inside [EDGE, limit - EDGE]. */
function nudge(start: number, end: number, limit: number): number {
  if (start < EDGE) return EDGE - start;
  if (end > limit - EDGE) return limit - EDGE - end;
  return 0;
}

/** Shifts a just-placed tooltip back inside the window when its preferred spot would clip it. */
function keepOnScreen(el: HTMLElement | null) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const dx = nudge(rect.left, rect.right, window.innerWidth);
  const dy = nudge(rect.top, rect.bottom, window.innerHeight);
  if (dx || dy) el.style.translate = `${dx}px ${dy}px`;
}

/** A small dark label shown after a short hover (or on keyboard focus); fixed so panels never clip it. */
export function Tooltip({ label, shortcut, side = "bottom", children }: Props) {
  const anchor = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [style, setStyle] = useState<CSSProperties | null>(null);

  function open(delay: number) {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const rect = anchor.current?.getBoundingClientRect();
      if (rect) setStyle(place(rect, side));
    }, delay);
  }
  function close() {
    clearTimeout(timer.current);
    setStyle(null);
  }

  return (
    <span
      ref={anchor}
      className="inline-flex"
      onPointerEnter={() => open(DELAY_MS)}
      onPointerLeave={close}
      onPointerDown={close}
      onFocus={(e) => e.target.matches(":focus-visible") && open(0)}
      onBlur={close}
    >
      {children}
      {style && (
        <span
          ref={keepOnScreen}
          role="tooltip"
          style={style}
          className="anim-fade pointer-events-none fixed z-[70] flex items-center gap-2 rounded-[4px] border border-line-strong bg-header px-2 py-1 text-xs whitespace-nowrap text-fg shadow-lg"
        >
          {label}
          {shortcut && <kbd className="font-mono text-2xs text-fg-3">{shortcut}</kbd>}
        </span>
      )}
    </span>
  );
}
