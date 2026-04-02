import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

if (apiBaseUrl && typeof window !== "undefined") {
  const originalFetch = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === "string" && input.startsWith("/api/")) {
      return originalFetch(`${apiBaseUrl}${input}`, init);
    }

    return originalFetch(input, init);
  };
}

createRoot(document.getElementById("root")!).render(<App />);
