/** Solid top of onboarding — aligned with chat scene top (#2D2152) */
export const ONBOARDING_THEME_COLOR = '#2D2152';

/** Base tone below the top gradient blend */
export const ONBOARDING_SURFACE_BASE = '#0a0912';

/** Shared background layers for html.onboarding-route and .onboarding-screen */
export const ONBOARDING_BACKGROUND_LAYERS = [
  `linear-gradient(180deg, ${ONBOARDING_THEME_COLOR} 0%, #161024 26%, ${ONBOARDING_SURFACE_BASE} 52%)`,
  'radial-gradient(ellipse 120% 75% at 50% 12%, rgba(139, 92, 246, 0.34), transparent 58%)',
  'radial-gradient(circle at 88% 96%, rgba(212, 175, 55, 0.18), transparent 48%)',
  'radial-gradient(circle at 12% 28%, rgba(167, 139, 250, 0.14), transparent 42%)',
].join(', ');
