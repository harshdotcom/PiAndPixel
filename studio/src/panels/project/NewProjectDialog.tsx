import { FileBox, Triangle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useCreateProject, useTemplates } from "../../api/hooks";
import type { Template, TemplateId } from "../../api/types";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { ErrorText } from "../../ui/ErrorText";
import { fieldClass } from "../../ui/Select";

interface Props {
  onClose: () => void;
  onCreated: (id: string) => void;
}

const ICONS: Record<TemplateId, typeof Triangle> = { pythagoras: Triangle, blank: FileBox };

function TemplateCard({ template, selected, onSelect }: { template: Template; selected: boolean; onSelect: () => void }) {
  const Icon = ICONS[template.id];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`press flex flex-col items-start gap-2 rounded-[6px] border p-3 text-left transition-colors duration-[80ms] ${
        selected ? "border-accent bg-accent-weak" : "border-line bg-raised/40 hover:border-line-strong"
      }`}
    >
      <Icon size={20} strokeWidth={1.5} className={selected ? "text-accent" : "text-fg-2"} aria-hidden />
      <span className="text-sm font-semibold text-fg">{template.name}</span>
      <span className="text-xs text-fg-2">{template.description}</span>
    </button>
  );
}

/** "New project…" (Ctrl+N): a name and one of two template cards. */
export function NewProjectDialog({ onClose, onCreated }: Props) {
  const templates = useTemplates();
  const create = useCreateProject();
  const [name, setName] = useState("");
  const [template, setTemplate] = useState<TemplateId>("pythagoras");

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate({ name: name.trim(), template, description: null }, { onSuccess: (project) => onCreated(project.id) });
  }

  return (
    <Dialog title="New project" onClose={onClose} width={520}>
      <form id="new-project" onSubmit={submit} className="space-y-4">
        <label className="block space-y-1.5 text-sm text-fg-2">
          <span>Name</span>
          <input aria-label="Project name" placeholder="My explainer" maxLength={64} value={name} onChange={(e) => setName(e.target.value)} className={`${fieldClass} w-full`} />
        </label>
        <div className="space-y-1.5">
          <span className="text-sm text-fg-2">Template</span>
          {templates.error && <ErrorText error={templates.error} />}
          <div role="radiogroup" aria-label="Template" className="grid grid-cols-2 gap-2">
            {templates.data?.map((t) => (
              <TemplateCard key={t.id} template={t} selected={t.id === template} onSelect={() => setTemplate(t.id)} />
            ))}
          </div>
        </div>
        {create.error && <ErrorText error={create.error} />}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending || !templates.data}>
            {create.isPending ? "Creating…" : "Create project"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
