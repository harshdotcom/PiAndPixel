import { ChevronDown, ChevronRight, FileCode2, FileText, Folder, MoreHorizontal } from "lucide-react";
import type { MouseEvent } from "react";
import type { TreeNode } from "../../editor/fileTree";

interface Props {
  nodes: TreeNode[];
  depth: number;
  collapsed: ReadonlySet<string>;
  onToggle: (dir: string) => void;
  onOpen: (path: string) => void;
  /** Opens the row's context menu (Rename, Delete) at the pointer or below the button. */
  onMenu: (path: string, at: { x: number; y: number }) => void;
}

const row = "flex h-[26px] w-full items-center gap-1.5 rounded-[4px] pr-1 text-left text-sm transition-colors duration-[80ms]";

function FileIcon({ name }: { name: string }) {
  const props = { size: 14, strokeWidth: 1.75, className: "shrink-0 text-fg-3", "aria-hidden": true };
  return name.endsWith(".py") ? <FileCode2 {...props} /> : <FileText {...props} />;
}

function FileRow({ node, depth, onOpen, onMenu }: Omit<Props, "nodes" | "collapsed" | "onToggle"> & { node: TreeNode }) {
  const openMenu = (e: MouseEvent) => {
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    onMenu(node.path, e.type === "contextmenu" ? { x: e.clientX, y: e.clientY } : { x: rect.left, y: rect.bottom });
  };
  return (
    <li className="group flex items-center rounded-[4px] hover:bg-raised" onContextMenu={openMenu}>
      <button
        type="button"
        title={node.path}
        onClick={() => onOpen(node.path)}
        style={{ paddingLeft: depth * 12 + 22 }}
        className={`${row} min-w-0 flex-1 text-fg`}
      >
        <FileIcon name={node.name} />
        <span className="truncate">{node.name}</span>
      </button>
      <button
        type="button"
        aria-label={`More actions for ${node.path}`}
        onClick={openMenu}
        className="mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-[4px] text-fg-3 opacity-0 group-hover:opacity-100 hover:text-fg focus:opacity-100"
      >
        <MoreHorizontal size={14} strokeWidth={1.75} aria-hidden />
      </button>
    </li>
  );
}

/** One level of the file tree; folders recurse unless collapsed. */
export function TreeRows(props: Props) {
  const { nodes, depth, collapsed, onToggle } = props;
  return (
    <ul>
      {nodes.map((node) => {
        if (node.type !== "dir") return <FileRow key={node.path} {...props} node={node} />;
        const open = !collapsed.has(node.path);
        const Chevron = open ? ChevronDown : ChevronRight;
        return (
          <li key={node.path}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => onToggle(node.path)}
              style={{ paddingLeft: depth * 12 + 4 }}
              className={`${row} text-fg-2 hover:bg-raised hover:text-fg`}
            >
              <Chevron size={14} strokeWidth={1.75} className="shrink-0 text-fg-3" aria-hidden />
              <Folder size={14} strokeWidth={1.75} className="shrink-0 text-fg-3" aria-hidden />
              <span className="truncate">{node.name}</span>
            </button>
            {open && <TreeRows {...props} nodes={node.children} depth={depth + 1} />}
          </li>
        );
      })}
    </ul>
  );
}
