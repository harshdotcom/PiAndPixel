import { useState, type FormEvent } from "react";
import { useCreateProject, useTemplates } from "../api/hooks";
import type { TemplateId } from "../api/types";

interface Props {
  onCreated: (id: string) => void;
}

const inputClass =
  "w-full rounded-md border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent";

interface TemplateSelectProps {
  value: TemplateId;
  onChange: (id: TemplateId) => void;
  templates: ReturnType<typeof useTemplates>;
}

function TemplateSelect({ value, onChange, templates }: TemplateSelectProps) {
  return (
    <select
      aria-label="Template"
      value={value}
      onChange={(e) => onChange(e.target.value as TemplateId)}
      className={inputClass}
    >
      {!templates.data && (
        <option value={value}>{templates.error ? "Templates unavailable" : "Loading templates…"}</option>
      )}
      {templates.data?.map((t) => (
        <option key={t.id} value={t.id} title={t.description}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

export function NewProjectForm({ onCreated }: Props) {
  const templates = useTemplates();
  const create = useCreateProject();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<TemplateId>("pythagoras");

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate(
      { name: name.trim(), template, description: null },
      {
        onSuccess: (project) => {
          setName("");
          onCreated(project.id);
        },
      },
    );
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">New project</h3>
      <input
        aria-label="Project name"
        placeholder="Project name"
        maxLength={64}
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={inputClass}
      />
      <TemplateSelect value={template} onChange={setTemplate} templates={templates} />
      <button
        type="submit"
        disabled={!name.trim() || create.isPending || !templates.data}
        className="w-full rounded-md border border-accent/50 px-3 py-2 text-sm font-medium text-accent transition hover:bg-accent/10 disabled:opacity-40"
      >
        {create.isPending ? "Creating…" : "Create project"}
      </button>
      {create.error && <p className="text-xs text-error">{create.error.message}</p>}
    </form>
  );
}
