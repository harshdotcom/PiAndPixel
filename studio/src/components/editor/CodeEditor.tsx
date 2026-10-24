import Editor, { type OnMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useEffect, useRef, useState } from "react";
import "../../editor/monaco";

interface Props {
  path: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  /** 1-based line to reveal and put the cursor on; changes re-reveal. */
  revealLine: number | null;
}

function languageOf(path: string): string {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".yaml") || path.endsWith(".yml")) return "yaml";
  return "plaintext";
}

const OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  automaticLayout: true,
  fontSize: 13,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  tabSize: 4,
};

/** Monaco, loaded from the bundled monaco-editor (never a CDN). */
export function CodeEditor({ path, value, onChange, onSave, revealLine }: Props) {
  const [instance, setInstance] = useState<editor.IStandaloneCodeEditor | null>(null);
  const latestSave = useRef(onSave);
  useEffect(() => {
    latestSave.current = onSave;
  });

  const handleMount: OnMount = (mounted, api) => {
    mounted.addCommand(api.KeyMod.CtrlCmd | api.KeyCode.KeyS, () => latestSave.current());
    setInstance(mounted);
  };

  useEffect(() => {
    if (!instance || revealLine === null) return;
    instance.revealLineInCenter(revealLine);
    instance.setPosition({ lineNumber: revealLine, column: 1 });
    instance.focus();
  }, [instance, path, revealLine]);

  return (
    <Editor
      path={path}
      value={value}
      language={languageOf(path)}
      theme="vs-dark"
      options={OPTIONS}
      onChange={(next) => onChange(next ?? "")}
      onMount={handleMount}
      loading={<p className="p-4 text-sm text-muted">Loading editor…</p>}
    />
  );
}
