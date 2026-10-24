# Studio UI Design Spec (v2: "Editing" workspace)

Goal: the Studio should look and behave like a professional editing application (Adobe Premiere Pro / After Effects), not a web form. It should have dense, calm, dark panels that dock, resize, show/hide and maximize, with the video and timeline at the centre of the work.

This spec is the acceptance reference. Anything not specified here should follow Premiere Pro's "Editing" workspace.

---

## 1. Workspace layout

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ TITLE BAR 40px: [π&px] Project ▾ (switcher) │ Window ▾ │ workspace: Editing      │ ● Agent · 8 CPU · 7.5 GB │ Queue 0 │ ⚙ │
├──┬─────────────────────────────────────┬────────────────────────────────────┬──────────┤
│R │ EDITOR (Source)                     │ PROGRAM MONITOR                    │ INSPECTOR│
│A │ tabs: main.py ● | intro.py          │  ┌──────────────────────────────┐  │ (Proper- │
│I │ Monaco                              │  │        video, letterboxed     │  │  ties)   │
│L │                                     │  │   [safe-area overlay toggle]  │  │          │
│  │                                     │  └──────────────────────────────┘  │ Selection│
│44│                                     │  00:00:12:05 ⏮ ◀| ▶ |▶ ⏭ ⟲  00:00:40:07│ Output   │
│px│                                     │  Format ▾ Res ▾ FPS ▾   [● Render] │ Job      │
├──┼─────────────────────────────────────┴────────────────────────────────────┤          │
│  │ PROJECT (bin)          │ TIMELINE: main ▾  | teaser                         │          │
│  │ tabs Files|Scenes|     │ ruler 00:00 ─ 00:05 ─ 00:10 ─ 00:15               │          │
│  │      Renders           │ V1 [Intro████][Proof██████][Outro███]   ▼playhead  │          │
│  │ list/grid toggle       │ toolbar: + clip  zoom ─●─  [Export ▸]              │          │
│  │                        │ bottom tabs: Timeline | Logs | Terminal            │          │
├──┴────────────────────────┴───────────────────────────────────────────────────┴──────────┤
│ STATUS BAR 24px: ● Connected │ Rendering Proof 3/7 animations · 0:04 │ Ln 37, Col 12 │ 480p@15 │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

Default split at 1920×1080: rail 44px; inspector 300px; top row 58% of height, bottom row 42%; editor and monitor 50/50; project bin 340px. Every splitter between panels can be dragged. Panel minimum sizes: editor 320px, monitor 360px, bin 220px, timeline 400px, inspector 260px.

### Panels

| Panel | Contents | Shortcut (Premiere-aligned) |
|---|---|---|
| **Project** (bin) | Tabs **Files** (tree, + New file, rename and delete in a context menu), **Scenes** (discovered scenes; double-click opens the file; "Render" on hover), **Renders** (past renders as a list, or a grid with a thumbnail frame, duration and `480p@15` badge). A list/grid toggle sits in the panel header. | Shift+1 |
| **Editor** (Source) | Monaco editor tabs with unsaved dot, Ctrl/Cmd+S, the existing "changed on disk" conflict bar | Shift+2 |
| **Timeline** | Composition tabs (+ new). A time ruler. Track **V1** with clips as blocks whose width is proportional to the clip's last-known rendered duration; clips never rendered show a dashed outline at 5 s labelled "not rendered". Drag to reorder, Delete key removes, click selects (Inspector shows params), double-click opens the scene file. A playhead linked to the Program Monitor when the export is playing. Zoom slider. An "Export ▸" primary button. Dirty state: "● unsaved" with Save (Ctrl+S when the timeline is focused). | Shift+3 |
| **Program Monitor** | The video, letterboxed on #000 at the correct aspect. Custom transport: timecode `HH:MM:SS:FF` (the render's fps), go to start, step back 1 frame, play/pause, step forward 1 frame, go to end, loop toggle, duration. Safe-area overlay toggle (action safe 90%, title safe 80%). Footer: Format, Resolution, FPS selects with exact output size, and **● Render** (primary, red dot like a record button). While a render runs, a thin progress bar sits along the monitor's bottom edge, with "Rendering… 3 animations · 0:04" over a dimmed last frame. | Shift+4 |
| **Inspector** (Properties) | Context sections, each collapsible: **Selection** (selected clip: scene ref, params JSON editor with validation), **Output** (export settings: format, resolution, fps, estimated size), **Job** (status pill, attempt, elapsed, animations, Cancel / Retry), **Agent** (machine capabilities). | Shift+5 |
| **Logs** | Live job log with clickable traceback links (existing behaviour), filter box, "Follow" toggle, Clear | tab in the bottom dock |
| **Terminal** | The existing xterm terminal | tab in the bottom dock; Ctrl+` |

The current "New project" form becomes a **modal dialog** opened from the Project switcher ("New project…", Ctrl+N). Template choices are shown as two cards (Pythagoras explainer, Blank).

---

## 2. Show / hide / maximize (required)

1. **Every panel header** (height 28px) has, on the right: **maximize** (⤢, toggles the panel full-workspace; the backtick key ` does the same for the focused panel, as in Premiere) and **hide** (×).
2. **The left rail** (44px) has one icon button per panel: Project, Editor, Timeline, Monitor, Inspector, Logs, Terminal. An active panel shows a 2px accent bar on the left of its icon and a highlighted icon. Clicking an icon toggles the panel. A tooltip shows the name and shortcut.
3. **Window menu** (title bar) lists every panel with a ✓ when visible, plus "Reset workspace".
4. **Keyboard:** Shift+1…5 focus or show the panels above. A second press of the same shortcut while the panel is focused hides it. ` maximizes or restores. Ctrl+` toggles the Terminal.
5. **Hiding a panel** gives its space to its neighbour in the same split. If every panel in a row is hidden, the row disappears. Showing it again restores the previous size.
6. **The focused panel** has a 1px accent outline and a brighter header title, as in Premiere's active-panel highlight.
7. **Layout persistence:** panel visibility, sizes and the maximized panel are saved in `localStorage` (key `pnp.layout.v1`, every read and write wrapped in try/catch) and restored on load. "Reset workspace" restores the defaults.
8. **Narrow windows:** below 1280px wide the Inspector auto-hides; below 1024px the Project bin auto-hides. Both stay reachable from the rail.

---

## 3. Visual system

### Colour tokens (CSS variables on `:root`; dark only)

| Token | Value | Use |
|---|---|---|
| `--bg-app` | `#141519` | app background, gaps between panels |
| `--bg-panel` | `#1B1D23` | panel body |
| `--bg-header` | `#22252D` | panel headers, title bar, status bar |
| `--bg-raised` | `#2A2E38` | inputs, menus, hovered rows, clip blocks |
| `--bg-sunken` | `#0F1013` | monitor surround, editor gutter, terminal |
| `--line` | `#2E323C` | 1px panel borders and dividers |
| `--line-strong` | `#3A3F4B` | splitter hover, focused inputs |
| `--text` | `#E6E8EE` | primary text |
| `--text-2` | `#A9AFBC` | secondary text, labels |
| `--text-3` | `#6E7482` | hints, disabled |
| `--accent` | `#58C4DD` | focus outline, playhead, selected items, primary buttons (dark text on it) |
| `--accent-weak` | `rgba(88,196,221,0.14)` | selected row and tab background |
| `--record` | `#E5484D` | Render button dot, failed state |
| `--ok` | `#83C167` | completed |
| `--warn` | `#F0AC5F` | queued, unsaved |
| `--clip-scene` | `#3E6F86` | timeline clip fill (with a 2px top stripe in `--accent`) |

### Type

- **UI font:** Inter at 12px base, line-height 16px. Panel titles 11px semibold uppercase with 0.06em letter-spacing. Numbers use `font-variant-numeric: tabular-nums` (timecode, sizes, durations).
- **Mono font:** JetBrains Mono 12px for the editor, logs, terminal and timecode.
- Both are loaded from Google Fonts in `index.html`, falling back to system-ui / ui-monospace.

### Density and shape

- **Heights:** list rows 26px, inputs and selects 26px, buttons 26px (primary 28px), icon buttons 24×24 with 16px icons.
- **Radius:** 4px for controls, 6px for panels and dialogs. No large rounded cards.
- **Gaps:** 4px between panels, with `--bg-app` showing through like Premiere's panel gutters. 8px internal padding (12px in the Inspector).
- **Icons:** lucide-react, stroke 1.75, 16px, colour `--text-2`, `--text` on hover.

### Motion (subtle and fast; respect `prefers-reduced-motion: reduce` by turning it off)

- **Panel show/hide:** size animates for 160ms, `cubic-bezier(0.2, 0, 0, 1)`. Content fades in over 120ms.
- **Maximize/restore:** 180ms with the same curve.
- **Hover:** background changes over 80ms. Pressed buttons scale to 0.98.
- **Render progress bar:** an indeterminate shimmer while the total is unknown. Never a fake percentage (AGENTS.md rule 6).
- **Toasts:** bottom-right, slide up 8px and fade in over 160ms. Auto-dismiss after 4 s, or 8 s for errors. Shown when a render or export completes or fails, with a "Show" action.
- **No bouncing, no spring overshoot, no decorative animation.**

---

## 4. States that must be designed

- **Empty project:** the Editor shows "Open a file from Project ▸ Files" with a shortcut hint. The Timeline shows "No composition. Create one" (button). The Monitor shows a 16:9 placeholder with the π&px mark at 10% opacity and "Render a scene to preview it".
- **Agent disconnected:** the status bar dot turns red with "Reconnecting…", and actions that need the agent are disabled.
- **Token gate:** a centred 420px dialog on `--bg-app`, with a short explanation, a token input, and the hint "Use the full link printed by `pnp studio`".
- **Errors:** inline in the relevant panel, using `--record`, never as a raw JSON dump.

---

## 5. Implementation rules

- **Allowed new dependencies (pinned exactly):** `react-resizable-panels` (docking splits and persistence) and `lucide-react` (icons). Nothing else.
- **Keep all existing features and API calls working:** render, export, compositions, file editing, terminal, logs, cancel/retry, the resolution/FPS pickers and token handling. Move them into the new panels; don't rewrite their logic.
- **Code layout:**
  - `src/layout/` for workspace, panel chrome, rail, layout store and shortcuts.
  - `src/panels/` with one folder per panel.
  - `src/ui/` for primitives: Button, IconButton, Select, Tabs, Menu, Dialog, Toast, Tooltip.
- AGENTS.md size rules apply: functions about 40 lines max, files about 300 lines max.
- **Tests** cover the layout store (toggle, hide-gives-space, persistence, reset, corrupt storage), shortcut handling, the timecode formatter, timeline clip-width maths, and the existing component tests, which stay green.

## 6. Acceptance checks

1. Headless Chrome screenshots at 1920×1080, 1440×900 and 1280×800 match §1 (panel placement), §3 (tokens) and §4 (states), with no overflow, clipped text or double scrollbars.
2. Every panel can be hidden and shown again from the header ×, the rail, the Window menu and its keyboard shortcut. Maximize works with the button and `. Reloading keeps the layout; Reset workspace restores it.
3. A full flow works in the new UI: open file, edit, save, Render, the video plays in the Program Monitor with working transport and timecode, build a composition in the Timeline, Export, the export plays.
4. `pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass, and `make check` passes.
