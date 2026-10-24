export type LogSegment = { text: string } | { text: string; path: string; line: number };

// A render runs on a copy of the project: the job attempt's scratch src/ or a revision snapshot.
const SNAPSHOT_PREFIXES = [
  /\/\.pnp\/jobs\/[0-9a-f]{32}\/(?:attempt-\d+\/)?src\/(.+)$/,
  /\/\.pnp\/revisions\/[0-9a-f]{64}\/src\/(.+)$/,
];

// `File "<path>", line <N>` (Python) or `<path>.py:<N>` (rich / Manim tracebacks).
const REFERENCE = /File "([^"]+)", line (\d+)|([^\s"'():│]+\.py):(\d+)/g;

function isPlainRelative(path: string): boolean {
  if (path.startsWith("/") || /[<>]|^[A-Za-z]:/.test(path)) return false;
  return path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/**
 * Map a path printed by a render (inside a job's attempt scratch copy or a revision
 * snapshot, or already relative) to the project-relative path, or null if it is outside
 * the project (e.g. site-packages).
 */
export function toProjectPath(raw: string): string | null {
  const path = raw.replaceAll("\\", "/");
  for (const prefix of SNAPSHOT_PREFIXES) {
    const rel = prefix.exec(path)?.[1];
    if (rel !== undefined) return isPlainRelative(rel) ? rel : null;
  }
  return isPlainRelative(path) ? path : null;
}

// Rich draws Manim's traceback 100 columns wide and folds a long scratch path onto the
// next box line(s), e.g. "│ /ws/p/.pnp/jobs/<id>/attempt-1 │" + "│ /src/a.py:3 in f │".
const BOX_LINE = /^│ (.*?)\s*│$/;
const PY_LINE_REF = /\.py:\d/;
// The fold can also split the line number: "…/a.py:3 │" + "│ 7 in construct │" is line 37.
const ENDS_IN_LINE_NUMBER = /\.py:\d*$/;

/** Whether `part` (the next box line) still belongs to the folded path in `joined`. */
function continuesPath(joined: string, part: string): boolean {
  if (!PY_LINE_REF.test(joined)) return true;
  return ENDS_IN_LINE_NUMBER.test(joined) && /^\d/.test(part);
}

function boxText(line: string | undefined): string | null {
  const text = line === undefined ? undefined : BOX_LINE.exec(line)?.[1];
  return text && !text.startsWith(" ") ? text : null;
}

/** Join rich box lines that fold one path, so the path can become a single link. */
export function joinFoldedPaths(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let joined = boxText(lines[i]);
    let next = i + 1;
    while (joined?.startsWith("/") && !/\s/.test(joined)) {
      const part = boxText(lines[next]);
      if (part === null || !continuesPath(joined, part)) break;
      joined += part;
      next += 1;
    }
    if (joined !== null && next > i + 1 && PY_LINE_REF.test(joined)) {
      out.push(`│ ${joined} │`);
      i = next - 1;
    } else {
      out.push(lines[i] ?? "");
    }
  }
  return out;
}

/**
 * Split one log line into plain text and file:line link segments. Only a reference to a file
 * in `projectFiles` (project-relative paths from the file tree) becomes a link.
 */
export function parseLogLine(line: string, projectFiles: ReadonlySet<string>): LogSegment[] {
  const segments: LogSegment[] = [];
  let plainStart = 0;
  for (const match of line.matchAll(REFERENCE)) {
    const raw = match[1] ?? match[3] ?? "";
    // Manim's log column names its own files by basename ("scene_file_writer.py:173"), so a
    // bare `name.py:N` is not a project link; a `File "…"` frame or a path with folders is.
    if (match[3] !== undefined && !/[\\/]/.test(match[3])) continue;
    const lineNumber = Number(match[2] ?? match[4]);
    const path = toProjectPath(raw);
    if (path === null || lineNumber < 1 || !projectFiles.has(path)) continue;
    if (match.index > plainStart) segments.push({ text: line.slice(plainStart, match.index) });
    segments.push({ text: match[0], path, line: lineNumber });
    plainStart = match.index + match[0].length;
  }
  if (plainStart < line.length || segments.length === 0) {
    segments.push({ text: line.slice(plainStart) });
  }
  return segments;
}
