import { useEffect, useRef } from "react";
import { useLayout, type LayoutApi } from "./LayoutContext";
import { isShown } from "./layoutStore";
import { isEditableTarget, matchShortcut, panelShortcutEffect, type ShortcutAction } from "./shortcuts";

function run(action: ShortcutAction, layout: LayoutApi, onNewProject: () => void) {
  switch (action.type) {
    case "panel": {
      const effect = panelShortcutEffect(layout.state, layout.focused, action.id);
      if (effect === "hide") layout.hide(action.id);
      else layout.focus(action.id);
      return;
    }
    case "maximize":
      if (layout.state.maximized) layout.toggleMaximize(layout.state.maximized);
      else if (layout.focused) layout.toggleMaximize(layout.focused);
      return;
    case "terminal":
      if (isShown(layout.state, "terminal")) layout.hide("terminal");
      else layout.focus("terminal");
      return;
    case "newProject":
      onNewProject();
  }
}

/** Workspace shortcuts on the window (capture phase, so Ctrl+` works inside the terminal too). */
export function useShortcuts(onNewProject: () => void) {
  const layout = useLayout();
  const latest = useRef({ layout, onNewProject });
  useEffect(() => {
    latest.current = { layout, onNewProject };
  });
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.repeat || document.querySelector("[aria-modal='true']")) return;
      const action = matchShortcut(e, isEditableTarget(e.target));
      if (!action) return;
      e.preventDefault();
      e.stopPropagation();
      run(action, latest.current.layout, latest.current.onNewProject);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
