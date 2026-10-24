import { Maximize2, Minimize2, X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { IconButton } from "../ui/Button";
import { useLayout } from "./LayoutContext";
import { dockVisible, isVisible } from "./layoutStore";
import { PANELS, frameOf, type FrameId, type PanelId } from "./panels";
import { useMaximizeMotion } from "./useMaximizeMotion";

interface Props {
  frame: FrameId;
  /** The panel in front: the one the header buttons maximize and hide. */
  panel: PanelId;
  /** Header content left of the buttons; defaults to the panel's title. */
  title?: ReactNode;
  /** Shown after the title in normal case, e.g. the project name. */
  subtitle?: ReactNode;
  /** Extra header buttons, before maximize and hide. */
  actions?: ReactNode;
  children: ReactNode;
}

/** Header title; brighter while its panel is the focused one (Premiere's active panel). */
function FrameTitle({ text, focused }: { text: string; focused: boolean }) {
  return <h2 className={`panel-title truncate ${focused ? "text-fg" : "text-fg-2"}`}>{text}</h2>;
}

interface HeaderProps extends Pick<Props, "panel" | "title" | "subtitle" | "actions"> {
  focused: boolean;
  maximized: boolean;
}

/** The 28px header: title (or tabs), extra actions, then maximize and hide. */
function FrameHeader({ panel, title, subtitle, actions, focused, maximized }: HeaderProps) {
  const layout = useLayout();
  return (
    <header className="flex h-7 shrink-0 items-center gap-0.5 border-b border-line bg-header pr-1 pl-2.5">
      <div className="flex h-full min-w-0 flex-1 items-center">
        {title ?? <FrameTitle text={PANELS[panel].title} focused={focused} />}
        {subtitle && <span className="ml-2 min-w-0 truncate text-xs text-fg-3">{subtitle}</span>}
      </div>
      {actions}
      {actions && <span className="mx-1 h-3.5 w-px bg-line" aria-hidden />}
      <IconButton
        icon={maximized ? Minimize2 : Maximize2}
        label={maximized ? "Restore panel" : "Maximize panel"}
        shortcut="`"
        onClick={() => layout.toggleMaximize(panel)}
      />
      <IconButton icon={X} label={`Hide ${PANELS[panel].title}`} onClick={() => layout.hide(panel)} />
    </header>
  );
}

/**
 * One docked panel box: a 28px header with maximize (or `) and hide, and the body. It tracks
 * focus for the active-panel outline and is taken out of tab order while hidden.
 */
export function PanelFrame({ frame, panel, title, subtitle, actions, children }: Props) {
  const layout = useLayout();
  const { state, focused, registerFrame } = layout;
  const ref = useRef<HTMLElement>(null);
  const visible = frame === "dock" ? dockVisible(state) : isVisible(state, panel);
  const maximized = state.maximized !== null && frameOf(state.maximized) === frame;
  const laidOutMaximized = useMaximizeMotion(ref, maximized);
  const isFocused = focused !== null && frameOf(focused) === frame;

  useEffect(() => {
    registerFrame(frame, ref.current);
    return () => registerFrame(frame, null);
  }, [frame, registerFrame]);
  useEffect(() => {
    ref.current?.toggleAttribute("inert", !visible);
  }, [visible]);

  return (
    <section
      ref={ref}
      aria-label={PANELS[panel].title}
      tabIndex={-1}
      data-frame={frame}
      data-hidden={visible ? undefined : ""}
      data-maximized={laidOutMaximized ? "" : undefined}
      data-focused={isFocused ? "" : undefined}
      onPointerDownCapture={() => layout.markFocused(panel)}
      onFocusCapture={() => layout.markFocused(panel)}
      className={`frame flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-[6px] border bg-panel outline-none ${
        isFocused ? "border-accent" : "border-line"
      }`}
    >
      <FrameHeader panel={panel} title={title} subtitle={subtitle} actions={actions} focused={isFocused} maximized={maximized} />
      <div className="relative min-h-0 flex-1">{children}</div>
    </section>
  );
}
