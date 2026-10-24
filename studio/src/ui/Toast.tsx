import { CircleAlert, CircleCheck, X } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";

export interface ToastInput {
  kind: "success" | "error";
  title: string;
  detail?: string;
  action?: { label: string; onClick: () => void };
}

interface Toast extends ToastInput {
  id: number;
}

const SUCCESS_MS = 4000;
const ERROR_MS = 8000;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(next: Toast[]) {
  toasts = next;
  listeners.forEach((listener) => listener());
}

export function showToast(input: ToastInput): void {
  emit([...toasts.slice(-3), { ...input, id: nextId++ }]);
}

export function dismissToast(id: number): void {
  emit(toasts.filter((t) => t.id !== id));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function ToastCard({ toast }: { toast: Toast }) {
  useEffect(() => {
    const timer = setTimeout(() => dismissToast(toast.id), toast.kind === "error" ? ERROR_MS : SUCCESS_MS);
    return () => clearTimeout(timer);
  }, [toast]);
  const Icon = toast.kind === "error" ? CircleAlert : CircleCheck;
  return (
    <div
      role="status"
      className="anim-toast flex w-[340px] items-start gap-2.5 rounded-[6px] border border-line-strong bg-header p-3 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
    >
      <Icon size={16} strokeWidth={1.75} className={toast.kind === "error" ? "text-record" : "text-ok"} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-fg">{toast.title}</p>
        {toast.detail && <p className="mt-0.5 truncate text-xs text-fg-2">{toast.detail}</p>}
      </div>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            dismissToast(toast.id);
          }}
          className="press rounded-[4px] px-1.5 text-sm font-medium text-accent hover:bg-accent-weak"
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" aria-label="Dismiss" onClick={() => dismissToast(toast.id)} className="text-fg-3 hover:text-fg">
        <X size={14} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/** Bottom-right stack of toasts; render once. */
export function ToastViewport() {
  const list = useSyncExternalStore(subscribe, () => toasts);
  return (
    <div className="pointer-events-none fixed right-4 bottom-9 z-[65] flex flex-col items-end gap-2 [&>*]:pointer-events-auto">
      {list.map((toast) => (
        <ToastCard key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
