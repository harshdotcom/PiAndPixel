import { joinFoldedPaths, parseLogLine } from "../../editor/traceback";
import { requestOpenFile } from "../../state/openFile";

interface Props {
  lines: string[];
  /** Project-relative paths of the project's files; only these become links. */
  projectFiles: ReadonlySet<string>;
}

function LogLine({ line, projectFiles }: { line: string; projectFiles: ReadonlySet<string> }) {
  return (
    <>
      {parseLogLine(line, projectFiles).map((segment, i) =>
        "path" in segment ? (
          <button
            key={i}
            type="button"
            title={`Open ${segment.path} at line ${segment.line}`}
            onClick={() => requestOpenFile({ path: segment.path, line: segment.line })}
            className="cursor-pointer text-accent underline decoration-dotted hover:decoration-solid"
          >
            {segment.text}
          </button>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}

/** Log text in which traceback file:line references become links into the editor. */
export function LogLines({ lines, projectFiles }: Props) {
  return (
    <>
      {joinFoldedPaths(lines).map((line, i) => (
        <span key={i}>
          {i > 0 && "\n"}
          <LogLine line={line} projectFiles={projectFiles} />
        </span>
      ))}
    </>
  );
}
