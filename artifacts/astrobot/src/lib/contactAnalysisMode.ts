/** Per-contact «глубокий / базовый» разбор — localStorage, без миграции БД. */

const STORAGE_KEY = 'astrobot_contact_extended_mode_v1';

function readMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'boolean') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getContactExtendedMode(contactId: number): boolean {
  const map = readMap();
  return Boolean(map[String(contactId)]);
}

export function setContactExtendedMode(contactId: number, extended: boolean) {
  const map = readMap();
  map[String(contactId)] = extended;
  writeMap(map);
}
