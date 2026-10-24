import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TokenGate } from "./TokenGate";

describe("TokenGate", () => {
  it("clears the rejection message once a new token is typed", () => {
    render(<TokenGate onSubmit={vi.fn()} rejected />);
    expect(screen.getByRole("alert")).toHaveTextContent("rejected the token");
    fireEvent.change(screen.getByLabelText("Token"), { target: { value: "new-token" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("submits the trimmed token", () => {
    const onSubmit = vi.fn();
    render(<TokenGate onSubmit={onSubmit} rejected={false} />);
    fireEvent.change(screen.getByLabelText("Token"), { target: { value: " abc " } });
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    expect(onSubmit).toHaveBeenCalledWith("abc");
  });
});
