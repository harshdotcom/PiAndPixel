import { PanelFrame } from "../../layout/PanelFrame";
import { EditorArea } from "./EditorArea";

/** The Editor (Source, Shift+2): Monaco with a tab per open file. */
export function EditorPanel({ pid }: { pid: string }) {
  return (
    <PanelFrame frame="editor" panel="editor">
      <EditorArea pid={pid} />
    </PanelFrame>
  );
}
