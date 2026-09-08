/**
 * TEMPORARY diagnostic helper for the Yandex OAuth "white page" bug report.
 * Beacons client-side errors/events to the server so they show up in Railway logs,
 * since the user can't open browser DevTools on iPad/phone. Remove once diagnosed.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '');

export function reportClientEvent(payload: Record<string, unknown>): void {
  try {
    const body = JSON.stringify({
      ...payload,
      url: window.location.href,
      ua: navigator.userAgent,
      ts: Date.now(),
    });
    const endpoint = `${API_BASE}/api/client-log`;
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
    } else {
      void fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // best-effort diagnostics only
  }
}
