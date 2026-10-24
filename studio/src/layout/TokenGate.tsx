import { KeyRound } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Button } from "../ui/Button";
import { fieldClass } from "../ui/Select";

interface Props {
  onSubmit: (token: string) => void;
  rejected: boolean;
}

function TokenField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <>
      <label htmlFor="token" className="block text-sm text-fg-2">
        Token
      </label>
      <div className="relative">
        <KeyRound size={14} className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-fg-3" aria-hidden />
        <input id="token" type="password" autoComplete="off" autoFocus value={value} onChange={(e) => onChange(e.target.value)} className={`${fieldClass} w-full pl-7 font-mono`} />
      </div>
    </>
  );
}

/** The centred 420px dialog shown until the Studio has a token the Agent accepts. */
export function TokenGate({ onSubmit, rejected }: Props) {
  const [value, setValue] = useState("");
  // The rejection is about the token last submitted; typing a new one makes it stale.
  const [edited, setEdited] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    const token = value.trim();
    if (!token) return;
    setEdited(false);
    onSubmit(token);
  }

  return (
    <div className="flex h-full items-center justify-center bg-app px-4">
      <form
        onSubmit={submit}
        aria-label="Connect to the agent"
        className="anim-dialog w-[420px] max-w-full rounded-[6px] border border-line-strong bg-panel shadow-[0_24px_64px_rgba(0,0,0,0.6)]"
      >
        <header className="flex h-10 items-center gap-2 border-b border-line px-4">
          <span className="rounded-[4px] bg-accent px-1.5 text-sm font-bold text-sunken">π&amp;px</span>
          <h1 className="text-base font-semibold">Connect to the agent</h1>
        </header>
        <div className="space-y-3 p-4">
          <p className="text-sm text-fg-2">
            Pi &amp; Pixel Studio talks to an Agent on your machine. It needs the access token the Agent printed when it started.
          </p>
          <TokenField
            value={value}
            onChange={(next) => {
              setValue(next);
              setEdited(true);
            }}
          />
          {rejected && !edited && (
            <p role="alert" className="text-sm text-record">
              The agent rejected the token. Check the terminal running pnp studio.
            </p>
          )}
          <p className="text-xs text-fg-3">
            Use the full link printed by <code className="font-mono text-fg-2">pnp studio</code>. The token stays in this tab only.
          </p>
        </div>
        <footer className="flex justify-end border-t border-line px-4 py-3">
          <Button type="submit" variant="primary" disabled={!value.trim()}>
            Connect
          </Button>
        </footer>
      </form>
    </div>
  );
}
