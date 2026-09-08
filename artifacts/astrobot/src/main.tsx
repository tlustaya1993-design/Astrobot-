import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { reportClientEvent } from "./lib/clientLog";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

// TEMPORARY: diagnosing the Yandex OAuth "white page" report — no DevTools access on the
// reporter's devices, so uncaught errors get beaconed to server logs instead. Remove once diagnosed.
window.addEventListener("error", (event) => {
  reportClientEvent({
    kind: "window.error",
    message: event.message,
    stack: event.error?.stack,
    filename: event.filename,
    lineno: event.lineno,
    colno: event.colno,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason as { message?: string; stack?: string } | undefined;
  reportClientEvent({
    kind: "unhandledrejection",
    message: reason?.message ?? String(event.reason),
    stack: reason?.stack,
  });
});

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
