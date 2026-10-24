import { Check } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type MenuEntry =
  | { kind?: "item"; label: string; onSelect: () => void; checked?: boolean; shortcut?: string; disabled?: boolean; danger?: boolean }
  | { kind: "separator" }
  | { kind: "label"; label: string };

export interface MenuPosition {
  x: number;
  y: number;
}

interface ListProps {
  items: MenuEntry[];
  position: MenuPosition;
  label: string;
  onClose: (refocus: boolean) => void;
}

function moveFocus(menu: HTMLElement, step: number) {
  const items = [...menu.querySelectorAll<HTMLButtonElement>("[role^=menuitem]:not(:disabled)")];
  const index = items.indexOf(document.activeElement as HTMLButtonElement);
  items[(index + step + items.length) % items.length]?.focus();
}

/** The open menu: fixed at `position`, closed by Escape, Tab or a click outside. */
export function MenuList({ items, position, label, onClose }: ListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>("[role^=menuitem]:not(:disabled)")?.focus();
    const outside = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && close.current(false);
    window.addEventListener("pointerdown", outside, true);
    return () => window.removeEventListener("pointerdown", outside, true);
  }, []);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(ref.current!, e.key === "ArrowDown" ? 1 : -1);
    } else if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      onClose(true);
    }
  }

  // Keep the whole menu on screen (rows are 26px, separators 9px).
  const height = items.reduce((h, item) => h + (item.kind === "separator" ? 9 : 26), 8);
  const left = Math.min(position.x, window.innerWidth - 248);
  const top = Math.max(4, Math.min(position.y, window.innerHeight - height - 4));
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ left, top }}
      className="anim-pop fixed z-[60] min-w-[200px] rounded-[6px] border border-line-strong bg-header py-1 shadow-[0_8px_28px_rgba(0,0,0,0.5)]"
    >
      {items.map((item, i) => (
        <MenuRow key={i} item={item} onDone={() => onClose(true)} />
      ))}
    </div>
  );
}

function MenuRow({ item, onDone }: { item: MenuEntry; onDone: () => void }) {
  if (item.kind === "separator") return <div role="separator" className="my-1 h-px bg-line" />;
  if (item.kind === "label") {
    return <div className="panel-title px-3 pt-1.5 pb-1 text-fg-3">{item.label}</div>;
  }
  const checkable = item.checked !== undefined;
  return (
    <button
      type="button"
      role={checkable ? "menuitemcheckbox" : "menuitem"}
      aria-checked={checkable ? item.checked : undefined}
      disabled={item.disabled}
      onClick={() => {
        onDone();
        item.onSelect();
      }}
      className={`flex h-[26px] w-full items-center gap-2 px-3 text-left text-sm outline-none hover:bg-accent-weak focus:bg-accent-weak disabled:opacity-40 ${
        item.danger ? "text-record" : "text-fg"
      }`}
    >
      <span className="flex w-3.5 justify-center text-accent">{item.checked && <Check size={14} strokeWidth={2} />}</span>
      <span className="flex-1 truncate">{item.label}</span>
      {item.shortcut && <kbd className="font-mono text-xs text-fg-3">{item.shortcut}</kbd>}
    </button>
  );
}

interface MenuProps {
  /** Accessible name of the trigger button and the menu. */
  label: string;
  trigger: ReactNode;
  items: MenuEntry[];
  triggerClassName?: string;
  disabled?: boolean;
  /** Shown on hover, e.g. why the menu is disabled. */
  title?: string;
}

/** A title-bar style menu: a trigger button and a dropdown list below it. */
export function Menu({ label, trigger, items, triggerClassName = "", disabled, title }: MenuProps) {
  const button = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  function toggle() {
    const rect = button.current?.getBoundingClientRect();
    setPosition(position || !rect ? null : { x: rect.left, y: rect.bottom + 2 });
  }
  function close(refocus: boolean) {
    setPosition(null);
    if (refocus) button.current?.focus();
  }

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={position !== null}
        disabled={disabled}
        title={title}
        onClick={toggle}
        className={`press flex h-[26px] items-center gap-1 rounded-[4px] px-2 text-sm hover:bg-raised disabled:opacity-40 aria-expanded:bg-raised ${triggerClassName}`}
      >
        {trigger}
      </button>
      {position && <MenuList items={items} position={position} label={label} onClose={close} />}
    </>
  );
}
