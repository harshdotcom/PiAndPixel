import type { FileEntry, FileType } from "../api/types";

export interface TreeNode {
  name: string;
  /** Project-relative path. */
  path: string;
  type: FileType;
  children: TreeNode[];
}

function byKindThenName(a: TreeNode, b: TreeNode): number {
  if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  nodes.sort(byKindThenName);
  nodes.forEach((node) => sortTree(node.children));
  return nodes;
}

/** Nests the Agent's flat, path-sorted list into folders (folders first, then by name). */
export function buildTree(entries: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirs = new Map<string, TreeNode>();

  function childrenOf(dirPath: string): TreeNode[] {
    if (dirPath === "") return root;
    const existing = dirs.get(dirPath);
    if (existing) return existing.children;
    // A folder missing from the list (should not happen) is created so its files still show.
    const slash = dirPath.lastIndexOf("/");
    const dir: TreeNode = { name: dirPath.slice(slash + 1), path: dirPath, type: "dir", children: [] };
    dirs.set(dirPath, dir);
    childrenOf(dirPath.slice(0, Math.max(slash, 0))).push(dir);
    return dir.children;
  }

  for (const entry of entries) {
    const slash = entry.path.lastIndexOf("/");
    const parent = entry.path.slice(0, Math.max(slash, 0));
    if (entry.type === "dir") {
      childrenOf(entry.path);
    } else {
      childrenOf(parent).push({ name: entry.path.slice(slash + 1), path: entry.path, type: "file", children: [] });
    }
  }
  return sortTree(root);
}
