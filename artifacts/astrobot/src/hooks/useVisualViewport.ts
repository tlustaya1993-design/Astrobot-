import { useEffect } from 'react';

/**
 * iOS Safari problem: when the soft keyboard appears the visual viewport
 * shrinks, but the CSS layout viewport (and therefore `100dvh`) may lag or
 * behave differently depending on the iOS version and whether the app runs
 * in a browser tab vs. PWA mode.
 *
 * This hook writes --vvh to <html> on every visual-viewport resize and on
 * window resize as a fallback. AppLayout reads it via `height: var(--vvh, 100dvh)`.
 *
 * Benefits:
 * - Prevents the black-screen / collapsed-chat bug when keyboard opens
 * - Works in both browser mode and PWA/standalone mode
 * - Gracefully falls back to 100dvh when visualViewport API is absent
 */
export function useVisualViewport(): void {
  useEffect(() => {
    function sync() {
      const h = window.visualViewport
        ? Math.round(window.visualViewport.height)
        : window.innerHeight;
      document.documentElement.style.setProperty('--vvh', `${h}px`);
    }

    // Initial paint — set before first render so there's no flash
    sync();

    window.visualViewport?.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('scroll', sync);
    // Also listen to window resize for browsers without visualViewport
    window.addEventListener('resize', sync);

    return () => {
      window.visualViewport?.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);
}
