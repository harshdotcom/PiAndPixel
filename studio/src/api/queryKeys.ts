// The React Query keys shared between features: whoever changes data invalidates these.

export const queryKeys = {
  agent: ["agent"] as const,
  projects: ["projects"] as const,
  project: (pid: string | null) => ["project", pid] as const,
  scenes: (pid: string | null) => ["scenes", pid] as const,
  files: (pid: string) => ["files", pid] as const,
  file: (pid: string, path: string) => ["file", pid, path] as const,
  revisions: (pid: string) => ["revisions", pid] as const,
  compositions: (pid: string) => ["compositions", pid] as const,
  jobs: (pid: string) => ["jobs", pid] as const,
  job: (jid: string | null) => ["job", jid] as const,
  exports: (pid: string) => ["exports", pid] as const,
  export: (eid: string | null) => ["export", eid] as const,
  artifact: (aid: string | null) => ["artifact", aid] as const,
};
