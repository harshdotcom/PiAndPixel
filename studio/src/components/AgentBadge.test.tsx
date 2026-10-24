import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgentInfo, ToolInfo } from "../api/types";
import { RENDER_OPTIONS } from "../test/fixtures";
import { AgentBadge } from "./AgentBadge";

const present = (version: string): ToolInfo => ({ available: true, version, path: "/usr/bin/x" });
const absent: ToolInfo = { available: false, version: null, path: null };

function agentInfo(tools: Partial<AgentInfo["tools"]>): AgentInfo {
  return {
    version: "0.1.0",
    target: "local",
    os: "Linux",
    cpu_count: 8,
    ram_total_mb: 16384,
    ram_free_mb: 4096,
    disk_free_mb: 50000,
    python: "3.12.7",
    tools: {
      manim: present("Manim Community v0.19.0"),
      ffmpeg: present("ffmpeg version 7.1"),
      ffprobe: present("ffprobe version 7.1"),
      latex: absent,
      ...tools,
    },
    features: { terminal: false },
    render_options: RENDER_OPTIONS,
  };
}

function renderBadge(info: AgentInfo) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(info), { status: 200 })),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AgentBadge />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("AgentBadge", () => {
  it("is ready (green) when manim and ffmpeg are available", async () => {
    renderBadge(agentInfo({}));

    const badge = await screen.findByTestId("agent-badge");
    expect(badge).toHaveAttribute("data-ready", "true");
    expect(badge).toHaveTextContent("Agent ready");
    expect(badge).toHaveTextContent("local");
    expect(badge).toHaveTextContent("8 CPU");
    expect(badge).toHaveTextContent("16.0 GB RAM");
    expect(badge).toHaveTextContent("Manim v0.19.0");
    expect(badge).toHaveTextContent("LaTeX ✗");
  });

  it("names the missing tools when manim or ffmpeg is absent", async () => {
    renderBadge(agentInfo({ manim: absent, ffmpeg: absent, latex: present("pdfTeX 3.14") }));

    const badge = await screen.findByTestId("agent-badge");
    expect(badge).toHaveAttribute("data-ready", "false");
    expect(badge).toHaveTextContent("Missing: manim, ffmpeg");
    expect(badge).toHaveTextContent("Manim not found");
    expect(badge).toHaveTextContent("LaTeX ✓");
  });
});
