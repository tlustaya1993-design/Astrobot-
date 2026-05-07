import { useEffect } from 'react';

/**
 * iOS Safari (browser tab) problem: when the soft keyboard appears the visual
 * viewport shrinks, but `100dvh` may lag. This hook writes --vvh so AppLayout
 * always tracks the real visible height.
 *
 * PWA / standalone mode exception: in iOS standalone mode visualViewport.height
 * is sometimes SMALLER than the actual available screen height (iOS quirk),
 * which creates a black gap below the bottom nav. In standalone mode we let
 * CSS `--vvh: 100dvh` (set in :root) handle it — 100dvh correctly fills the
 * screen in PWA mode — and skip the JS override entirely.
 */

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function useVisualViewport(): void {
  useEffect(() => {
    // In PWA/standalone mode, remove any previously-set inline --vvh so the
    // CSS default (100dvh) takes over. Don't add event listeners — no keyboard
    // resize quirks to track in standalone mode.
    if (isStandalone()) {
      document.documentElement.style.removeProperty('--vvh');
      return;
    }

    function sync() {
      const h = window.visualViewport
        ? Math.round(window.visualViewport.height)
        : window.innerHeight;
      document.documentElement.style.setProperty('--vvh', `${h}px`);
    }

    sync();

    window.visualViewport?.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);

    return () => {
      window.visualViewport?.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
    };
  }, []);
}
