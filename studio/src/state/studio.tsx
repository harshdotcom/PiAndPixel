import type { UseQueryResult } from "@tanstack/react-query";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useProject, useScenes } from "../api/hooks";
import type { ProjectDetail, SceneInfo, ScenesResponse } from "../api/types";

export interface StudioValue {
  pid: string;
  project: UseQueryResult<ProjectDetail>;
  scenesQuery: UseQueryResult<ScenesResponse>;
  scenes: SceneInfo[];
  /** The scene Render uses: the picked one, else the project's first. */
  sceneRef: string | null;
  selectScene: (ref: string) => void;
  /** The live events socket is open; actions that need the Agent are off while it is not. */
  connected: boolean;
}

const StudioContext = createContext<StudioValue | null>(null);

export function useStudio(): StudioValue {
  const value = useContext(StudioContext);
  if (!value) throw new Error("useStudio needs a StudioProvider");
  return value;
}

interface Props {
  pid: string;
  connected: boolean;
  children: ReactNode;
}

/** The open project, its scenes and the picked scene, for every panel. */
export function StudioProvider({ pid, connected, children }: Props) {
  const project = useProject(pid);
  const scenesQuery = useScenes(pid);
  const [picked, setPicked] = useState<string | null>(null);
  const scenes = scenesQuery.data?.scenes ?? [];
  const sceneRef = scenes.find((s) => s.ref === picked)?.ref ?? scenes[0]?.ref ?? null;
  const value = { pid, project, scenesQuery, scenes, sceneRef, selectScene: setPicked, connected };
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function sceneName(ref: string): string {
  return ref.split(":").pop() ?? ref;
}
