import { useEffect } from 'react';

/**
 * iOS Safari (browser tab): track visual viewport for layout height and pan offset.
 *
 * - While keyboard is open: shrink --vvh to visible height and apply --vv-offset-top
 *   so fixed layouts shift up with the visual viewport (input stays above keyboard).
 * - When keyboard closes: reset document scroll so the page does not stay "lifted".
 *
 * PWA / standalone: skip JS override; CSS 100dvh is enough there.
 */

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  );
}

export function useVisualViewport(): void {
  useEffect(() => {
    if (isStandalone()) {
      document.documentElement.style.removeProperty('--vvh');
      document.documentElement.style.removeProperty('--vv-offset-top');
      document.documentElement.classList.remove('keyboard-open');
      return;
    }

    let prevKeyboardOpen = false;

    function sync() {
      const vv = window.visualViewport;
      const visualH = vv ? Math.round(vv.height) : window.innerHeight;
      const layoutH = window.innerHeight;
      const keyboardVisible = layoutH - visualH > 120;
      const offsetTop = vv?.offsetTop ?? 0;

      document.documentElement.classList.toggle('keyboard-open', keyboardVisible);
      document.documentElement.style.setProperty('--vvh', `${visualH}px`);
      document.documentElement.style.setProperty('--vv-offset-top', `${offsetTop}px`);

      // Only fix the "stuck lifted" state after keyboard dismiss — never while typing.
      if (prevKeyboardOpen && !keyboardVisible) {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        window.dispatchEvent(new CustomEvent('astrobot:keyboard-dismiss'));
      }

      prevKeyboardOpen = keyboardVisible;
    }

    sync();

    window.visualViewport?.addEventListener('resize', sync);
    window.visualViewport?.addEventListener('scroll', sync);
    window.addEventListener('resize', sync);

    return () => {
      window.visualViewport?.removeEventListener('resize', sync);
      window.visualViewport?.removeEventListener('scroll', sync);
      window.removeEventListener('resize', sync);
      document.documentElement.classList.remove('keyboard-open');
      document.documentElement.style.removeProperty('--vv-offset-top');
    };
  }, []);
}
