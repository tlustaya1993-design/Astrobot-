export function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

export type PwaDevice =
  | 'ios-safari'
  | 'ios-other'
  | 'android-chrome'
  | 'android-yandex'
  | 'android-other'
  | 'desktop';

export function detectPwaDevice(): PwaDevice {
  const ua = navigator.userAgent;
  const isIos     = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isYandex  = /YaBrowser/.test(ua);
  // Chrome on desktop/Android — but NOT CriOS (Chrome on iOS)
  const isChrome  = /Chrome\//.test(ua) && !/CriOS|YaBrowser/.test(ua);
  // Safari-only: has "Safari" but none of the Chrome/Firefox/Opera/Yandex tokens
  const isSafariOnly = /Safari\//.test(ua) && !/Chrome|CriOS|FxiOS|OPiOS|YaBrowser/.test(ua);

  if (isIos) return isSafariOnly ? 'ios-safari' : 'ios-other';
  if (isAndroid) {
    if (isYandex) return 'android-yandex';
    if (isChrome) return 'android-chrome';
    return 'android-other';
  }
  return 'desktop';
}
