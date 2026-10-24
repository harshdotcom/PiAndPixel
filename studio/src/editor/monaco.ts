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
