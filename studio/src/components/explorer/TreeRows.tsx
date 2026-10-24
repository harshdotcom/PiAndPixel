import type { TreeNode } from "../../editor/fileTree";

interface Props {
  nodes: TreeNode[];
  depth: number;
  collapsed: ReadonlySet<string>;
  onToggle: (dir: string) => void;
  onOpen: (path: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}

const rowAction = "px-1 text-xs text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-white";

/** One level of the file tree; folders recurse unless collapsed. */
export function TreeRows(props: Props) {
  const { nodes, depth, collapsed, onToggle, onOpen, onRename, onDelete } = props;
  const indent = { paddingLeft: `${depth * 0.75 + 0.25}rem` };
  return (
    <ul>
      {nodes.map((node) =>
        node.type === "dir" ? (
          <li key={node.path}>
            <button
              type="button"
              aria-expanded={!collapsed.has(node.path)}
              onClick={() => onToggle(node.path)}
              style={indent}
              className="w-full truncate rounded py-0.5 text-left text-muted hover:bg-raised"
            >
              {collapsed.has(node.path) ? "▸" : "▾"} {node.name}
            </button>
            {!collapsed.has(node.path) && <TreeRows {...props} nodes={node.children} depth={depth + 1} />}
          </li>
        ) : (
          <li key={node.path} className="group flex items-center rounded hover:bg-raised">
            <button
              type="button"
              title={node.path}
              onClick={() => onOpen(node.path)}
              style={indent}
              className="min-w-0 flex-1 truncate py-0.5 text-left"
            >
              {node.name}
            </button>
            <button type="button" aria-label={`Rename ${node.path}`} onClick={() => onRename(node.path)} className={rowAction}>
              ✎
            </button>
            <button type="button" aria-label={`Delete ${node.path}`} onClick={() => onDelete(node.path)} className={rowAction}>
              ✕
            </button>
          </li>
        ),
      )}
    </ul>
  );
}
