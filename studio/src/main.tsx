import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { ApiError, captureTokenFromHash } from "./api/client";
import "./index.css";

// Run before React renders so the token never stays in the address bar.
captureTokenFromHash();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 4xx answers (bad token, unknown id) will not change on retry.
      retry: (count, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

const root = document.getElementById("root");
if (!root) throw new Error("index.html is missing #root");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
