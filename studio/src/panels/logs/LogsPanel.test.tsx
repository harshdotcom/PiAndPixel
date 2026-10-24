import { fireEvent, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeJob } from "../../test/fixtures";
import { fakeAgent, renderInStudio } from "../../test/studio";
import { LogsPanel } from "./LogsPanel";

const failing = makeJob({
  id: "bad",
  status: "failed",
  attempt: 1,
  log_tail: ["Animation 0 : done", '  File "scenes/proof.py", line 7, in construct', "INFO  done  cairo_renderer.py:89"],
});

afterEach(() => vi.unstubAllGlobals());

/** The Logs tab behind another dock tab, with a button that brings it to the front. */
function BehindATab() {
  const [active, setActive] = useState(false);
  return (
    <>
      <button onClick={() => setActive(true)}>Bring to front</button>
      <LogsPanel active={active} />
    </>
  );
}

describe("LogsPanel", () => {
  it("links traceback references only to files in the project", async () => {
    fakeAgent({ jobs: [failing] });
    renderInStudio(<LogsPanel />);
    const log = await screen.findByLabelText("Render log");
    expect(await within(log).findByRole("button", { name: /proof\.py", line 7/ })).toBeInTheDocument();
    expect(within(log).getAllByRole("button")).toHaveLength(1);
  });

  it("filters lines and clears what is shown so far", async () => {
    fakeAgent({ jobs: [failing] });
    renderInStudio(<LogsPanel />);
    const log = await screen.findByLabelText("Render log");
    await within(log).findByText(/Animation 0/);
    fireEvent.change(screen.getByLabelText("Filter log"), { target: { value: "cairo" } });
    expect(log).toHaveTextContent("cairo_renderer.py:89");
    expect(log).not.toHaveTextContent("Animation 0");
    fireEvent.change(screen.getByLabelText("Filter log"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(log).toHaveTextContent("No output yet.");
  });

  it("says what it is waiting for", async () => {
    fakeAgent({ jobs: [makeJob({ status: "queued" })] });
    renderInStudio(<LogsPanel />);
    expect(await screen.findByText("Waiting for the render slot…")).toBeInTheDocument();
  });

  it("scrolls to the newest line when its tab comes to the front with Follow on", async () => {
    fakeAgent({ jobs: [failing] });
    renderInStudio(<BehindATab />);
    const log = await screen.findByLabelText("Render log");
    await within(log).findByText(/Animation 0/);
    Object.defineProperty(log, "scrollHeight", { configurable: true, value: 574 });
    expect(log.scrollTop).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Bring to front" }));
    expect(log.scrollTop).toBe(574);
  });
});
