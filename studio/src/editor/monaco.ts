// Points @monaco-editor/react at the bundled monaco-editor instead of its default CDN, with
// only the languages a project needs. Imported by CodeEditor, which is loaded lazily, so
// Monaco stays out of the main chunk.

import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import "monaco-editor/features/find/register.js";
import "monaco-editor/languages/definitions/python/register.js";
import "monaco-editor/languages/definitions/yaml/register.js";

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });

// The Studio's panel colours (docs/ui-design.md §3) on top of the stock dark theme.
monaco.editor.defineTheme("pnp-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#1B1D23",
    "editorGutter.background": "#0F1013",
    "editorLineNumber.foreground": "#6E7482",
    "editorLineNumber.activeForeground": "#E6E8EE",
    "editor.lineHighlightBackground": "#22252D",
    "editor.lineHighlightBorder": "#00000000",
    "editorCursor.foreground": "#58C4DD",
    "editor.selectionBackground": "#58C4DD40",
    "editorWidget.background": "#22252D",
    "editorWidget.border": "#3A3F4B",
    "scrollbarSlider.background": "#2A2E3899",
    "scrollbarSlider.hoverBackground": "#3A3F4B",
  },
});
