/** Shared normalization for user + contact avatar JSON */

export type StoredAvatarConfig = {
  archetype: "mage" | "cosmonaut" | "galactic";
  hairStyle: string;
  hairColor: string;
  robeColor: string;
  eyeColor: string;
};

export const DEFAULT_AVATAR_CONFIG: StoredAvatarConfig = {
  archetype: "mage",
  hairStyle: "medium",
  hairColor: "#1c1c2e",
  robeColor: "#3730A3",
  eyeColor: "#3B82F6",
};

const ALLOWED_HAIR_STYLES = new Set(["short", "medium", "long", "curly", "ponytail", "bun"]);
const ALLOWED_ARCHETYPES = new Set(["mage", "cosmonaut", "galactic"]);
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function normalizeAvatarConfig(input: unknown): StoredAvatarConfig | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  const archetype = typeof v.archetype === "string" ? v.archetype : DEFAULT_AVATAR_CONFIG.archetype;
  const hairStyle = typeof v.hairStyle === "string" ? v.hairStyle : DEFAULT_AVATAR_CONFIG.hairStyle;
  const hairColor = typeof v.hairColor === "string" ? v.hairColor : DEFAULT_AVATAR_CONFIG.hairColor;
  const robeColor = typeof v.robeColor === "string" ? v.robeColor : DEFAULT_AVATAR_CONFIG.robeColor;
  const eyeColor = typeof v.eyeColor === "string" ? v.eyeColor : DEFAULT_AVATAR_CONFIG.eyeColor;

  return {
    archetype: ALLOWED_ARCHETYPES.has(archetype)
      ? (archetype as StoredAvatarConfig["archetype"])
      : DEFAULT_AVATAR_CONFIG.archetype,
    hairStyle: ALLOWED_HAIR_STYLES.has(hairStyle) ? hairStyle : DEFAULT_AVATAR_CONFIG.hairStyle,
    hairColor: HEX_COLOR_RE.test(hairColor) ? hairColor : DEFAULT_AVATAR_CONFIG.hairColor,
    robeColor: HEX_COLOR_RE.test(robeColor) ? robeColor : DEFAULT_AVATAR_CONFIG.robeColor,
    eyeColor: HEX_COLOR_RE.test(eyeColor) ? eyeColor : DEFAULT_AVATAR_CONFIG.eyeColor,
  };
}

export function parseAvatarJson(input: string | null): StoredAvatarConfig | null {
  if (!input) return null;
  try {
    return normalizeAvatarConfig(JSON.parse(input));
  } catch {
    return null;
  }
}
