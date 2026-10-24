import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentInfo, ToolInfo } from "../api/types";
import { jsonResponse, renderWithClient, stubFetch } from "../test/fixtures";
import { AGENT } from "../test/studio";
import { AgentSection } from "../panels/inspector/AgentSection";
import { AgentStatus } from "./TitleBar";

const absent: ToolInfo = { available: false, version: null, path: null };

function renderWith(info: AgentInfo) {
  stubFetch(() => jsonResponse(200, info));
  renderWithClient(
    <>
      <AgentStatus />
      <AgentSection />
    </>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("agent status", () => {
  it("is ready (green) with CPU and RAM in the title bar and the details in the Inspector", async () => {
    renderWith(AGENT);
    const badge = await screen.findByTestId("agent-badge");
    expect(badge).toHaveAttribute("data-ready", "true");
    expect(badge).toHaveTextContent(/Agent\s*· 8 CPU · 16\.0 GB/);
    expect(screen.getByText("local · Linux")).toBeInTheDocument();
    expect(screen.getByText("v0.19.0")).toBeInTheDocument();
    expect(screen.getByText("✗ not installed")).toBeInTheDocument();
  });

  it("names the missing tools when manim or ffmpeg is absent", async () => {
    renderWith({ ...AGENT, tools: { ...AGENT.tools, manim: absent, ffmpeg: absent, latex: { available: true, version: "x", path: "/x" } } });
    const badge = await screen.findByTestId("agent-badge");
    expect(badge).toHaveAttribute("data-ready", "false");
    expect(badge).toHaveTextContent("Missing: manim, ffmpeg");
    expect(screen.getAllByText("not found")).toHaveLength(2);
    expect(screen.getByText("✓ available")).toBeInTheDocument();
  });

  it("greys out the Inspector details as last known while the agent is unreachable", async () => {
    stubFetch(() => jsonResponse(200, AGENT));
    renderWithClient(<AgentSection stale />);
    expect(await screen.findByText("Last known")).toBeInTheDocument();
    expect(await screen.findByLabelText("Last known agent details")).toHaveClass("opacity-50");
  });

  it("turns red while the live connection is down", async () => {
    stubFetch(() => jsonResponse(200, AGENT));
    renderWithClient(<AgentStatus connected={false} />);
    expect(await screen.findByText("Agent unreachable")).toBeInTheDocument();
  });

  it("says when the agent cannot be reached", async () => {
    stubFetch(() => jsonResponse(500, { error: { code: "x", message: "down", details: null } }));
    renderWithClient(<AgentStatus />);
    expect(await screen.findByText("Agent unreachable")).toBeInTheDocument();
  });
});
