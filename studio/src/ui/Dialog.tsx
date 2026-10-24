import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "./Button";

interface Props {
  title: string;
  onClose?: () => void;
  width?: number;
  children: ReactNode;
  /** Buttons along the bottom edge, right-aligned. */
  footer?: ReactNode;
}

/** A centred modal dialog over a dimmed workspace; Escape closes it. */
export function Dialog({ title, onClose, width = 480, children, footer }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    if (box && !box.contains(document.activeElement)) {
      box.querySelector<HTMLElement>("input, select, textarea, button:not([aria-label='Close'])")?.focus();
    }
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className="anim-dialog max-w-full rounded-[6px] border border-line-strong bg-panel shadow-[0_24px_64px_rgba(0,0,0,0.6)]"
      >
        <header className="flex h-10 items-center border-b border-line pr-2 pl-4">
          <h2 className="flex-1 text-base font-semibold">{title}</h2>
          {onClose && <IconButton icon={X} label="Close" onClick={onClose} />}
        </header>
        <div className="p-4">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</footer>}
      </div>
    </div>
  );
}
