import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as store from "./layoutStore";
import { frameOf, type FrameId, type PanelId, type SplitId } from "./panels";

export interface LayoutApi {
  state: store.LayoutState;
  /** The panel the user last clicked or focused (Premiere's active panel). */
  focused: PanelId | null;
  toggle: (id: PanelId) => void;
  show: (id: PanelId) => void;
  hide: (id: PanelId) => void;
  /** Shows the panel if needed, brings its tab to the front and moves keyboard focus into it. */
  focus: (id: PanelId) => void;
  markFocused: (id: PanelId) => void;
  toggleMaximize: (id: PanelId) => void;
  setSplit: (id: SplitId, value: number) => void;
  reset: () => void;
  registerFrame: (frame: FrameId, element: HTMLElement | null) => void;
}

const LayoutContext = createContext<LayoutApi | null>(null);

export function useLayout(): LayoutApi {
  const api = useContext(LayoutContext);
  if (!api) throw new Error("useLayout needs a LayoutProvider");
  return api;
}

/** Applies the window width now and on every resize (narrow windows auto-hide panels). */
function useWindowWidth(update: (fn: (s: store.LayoutState) => store.LayoutState) => void) {
  useEffect(() => {
    let previous: number | null = null;
    function apply() {
      const width = window.innerWidth;
      update((s) => store.applyWidth(s, width, previous));
      previous = width;
    }
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [update]);
}

function useFrames() {
  const frames = useRef(new Map<FrameId, HTMLElement>());
  const registerFrame = useCallback((frame: FrameId, element: HTMLElement | null) => {
    if (element) frames.current.set(frame, element);
    else frames.current.delete(frame);
  }, []);
  const focusFrame = useCallback((frame: FrameId) => {
    // After the show/tab change has rendered.
    requestAnimationFrame(() => {
      const element = frames.current.get(frame);
      if (element && !element.contains(document.activeElement)) element.focus({ preventScroll: true });
    });
  }, []);
  return { registerFrame, focusFrame };
}

export function LayoutProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => store.loadLayout());
  const [focused, setFocused] = useState<PanelId | null>(null);
  const { registerFrame, focusFrame } = useFrames();
  useWindowWidth(setState);
  useEffect(() => store.saveLayout(state), [state]);

  const api = useMemo<LayoutApi>(() => {
    const hide = (id: PanelId) => {
      setState((s) => store.hide(s, id));
      setFocused((f) => (f === id ? null : f));
    };
    return {
      state,
      focused,
      toggle: (id) => (store.isShown(state, id) ? hide(id) : setState((s) => store.toggle(s, id))),
      show: (id) => setState((s) => store.show(s, id)),
      hide,
      focus: (id) => {
        setState((s) => store.show(s, id));
        setFocused(id);
        focusFrame(frameOf(id));
      },
      markFocused: setFocused,
      toggleMaximize: (id) => setState((s) => store.toggleMaximize(s, id)),
      setSplit: (id, value) => setState((s) => store.setSplit(s, id, value)),
      reset: () => setState(store.applyWidth(store.DEFAULT_LAYOUT, window.innerWidth, null)),
      registerFrame,
    };
  }, [state, focused, registerFrame, focusFrame]);

  return <LayoutContext.Provider value={api}>{children}</LayoutContext.Provider>;
}
