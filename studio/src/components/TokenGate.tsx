import { useState, type FormEvent } from "react";

interface Props {
  onSubmit: (token: string) => void;
  rejected: boolean;
}

export function TokenGate({ onSubmit, rejected }: Props) {
  const [value, setValue] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const token = value.trim();
    if (token) onSubmit(token);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-line bg-panel p-8 shadow-2xl"
      >
        <h1 className="text-xl font-semibold">
          Pi <span className="text-accent">&amp;</span> Pixel Studio
        </h1>
        <label htmlFor="token" className="mt-6 block text-sm text-muted">
          Paste the token printed by pnp studio
        </label>
        <input
          id="token"
          type="password"
          autoComplete="off"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="mt-2 w-full rounded-md border border-line bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-accent"
        />
        {rejected && (
          <p role="alert" className="mt-3 text-sm text-error">
            The agent rejected the token. Check the terminal running pnp studio.
          </p>
        )}
        <button
          type="submit"
          disabled={!value.trim()}
          className="mt-6 w-full rounded-md bg-accent px-4 py-2 font-medium text-bg transition hover:brightness-110 disabled:opacity-40"
        >
          Connect
        </button>
        <p className="mt-4 text-xs text-muted">
          The token is kept in this browser tab only and is cleared when the tab closes.
        </p>
      </form>
    </div>
  );
}
