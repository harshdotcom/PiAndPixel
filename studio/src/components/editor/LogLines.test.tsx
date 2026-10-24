import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { onOpenFile } from "../../state/openFile";
import { LogLines } from "./LogLines";

const JOB = "c".repeat(32);

describe("LogLines", () => {
  it("renders plain lines as text joined by newlines", () => {
    const { container } = render(
      <pre>
        <LogLines lines={["first", "second"]} projectFiles={new Set()} />
      </pre>,
    );
    expect(container.querySelector("pre")?.textContent).toBe("first\nsecond");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("turns a traceback frame into a link that opens the file at the line", () => {
    const listener = vi.fn();
    const stop = onOpenFile(listener);
    const frame = `  File "/ws/demo/.pnp/jobs/${JOB}/attempt-1/src/scenes/intro.py", line 9, in construct`;
    const lines = ["Traceback (most recent call last):", frame, "NameError: x"];
    render(<LogLines lines={lines} projectFiles={new Set(["scenes/intro.py"])} />);

    fireEvent.click(screen.getByRole("button", { name: /intro\.py", line 9/ }));
    expect(listener).toHaveBeenCalledWith({ path: "scenes/intro.py", line: 9 });
    stop();
  });

  it("leaves a reference to a file that is not in the project as plain text", () => {
    const frame = `  File "/ws/demo/.pnp/jobs/${JOB}/attempt-1/src/scenes/gone.py", line 9, in construct`;
    render(<LogLines lines={[frame]} projectFiles={new Set(["scenes/intro.py"])} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
