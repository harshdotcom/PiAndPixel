import type { ProjectSummary } from "../api/types";

interface Props {
  projects: ProjectSummary[];
  selected: string | null;
  onSelect: (id: string) => void;
}

export function ProjectList({ projects, selected, onSelect }: Props) {
  if (projects.length === 0) {
    return <p className="text-sm text-muted">No projects yet. Create one below.</p>;
  }

  return (
    <ul className="space-y-1">
      {projects.map((project) => {
        const active = project.id === selected;
        return (
          <li key={project.id}>
            <button
              type="button"
              disabled={project.error !== null}
              onClick={() => onSelect(project.id)}
              aria-current={active ? "true" : undefined}
              className={`w-full rounded-md px-3 py-2 text-left transition disabled:cursor-not-allowed ${
                active ? "bg-accent/15 text-accent" : "hover:bg-raised"
              }`}
            >
              <span className="block truncate text-sm font-medium">{project.name}</span>
              {project.error ? (
                <span className="block truncate text-xs text-error" title={project.error}>
                  {project.error}
                </span>
              ) : (
                <span className="block truncate text-xs text-muted">
                  {project.description || project.id}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
