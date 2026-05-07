import { find } from 'geo-tz';

export function getIanaTimezone(lat: number, lon: number): string | null {
  try {
    const zones = find(lat, lon);
    return zones[0] ?? null;
  } catch {
    return null;
  }
}

function getUtcOffsetMinutes(ianaTimezone: string, approximateDate: Date): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaTimezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const fmtUtc = new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  function parseLocale(parts: Intl.DateTimeFormatPart[]): number {
    const get = (type: string) => Number(parts.find(p => p.type === type)?.value ?? 0);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  }

  const localMs  = parseLocale(fmt.formatToParts(approximateDate));
  const utcMs    = parseLocale(fmtUtc.formatToParts(approximateDate));
  return (localMs - utcMs) / 60000;
}

export interface UtcBirthResolution {
  utcDateStr:    string;
  utcTimeStr:    string | null;
  timezone:      string | null;
  offsetMinutes: number | null;
}

/**
 * Converts local birth date+time to UTC using a timezone lookup by coordinates.
 * Falls back to the original values when time or coordinates are missing.
 */
export function resolveUtcBirthTime(
  dateStr: string,
  timeStr: string | null,
  lat: number | null,
  lon: number | null,
): UtcBirthResolution {
  if (!timeStr || lat === null || lon === null) {
    return { utcDateStr: dateStr, utcTimeStr: timeStr, timezone: null, offsetMinutes: null };
  }

  const timezone = getIanaTimezone(lat, lon);
  if (!timezone) {
    return { utcDateStr: dateStr, utcTimeStr: timeStr, timezone: null, offsetMinutes: null };
  }

  // Treat the local time as if it were UTC to get an approximate Date for offset lookup
  const naiveDate  = new Date(`${dateStr}T${timeStr}:00Z`);
  const offsetMin  = getUtcOffsetMinutes(timezone, naiveDate);
  const utcDate    = new Date(naiveDate.getTime() - offsetMin * 60 * 1000);

  return {
    utcDateStr:    utcDate.toISOString().slice(0, 10),
    utcTimeStr:    `${String(utcDate.getUTCHours()).padStart(2, '0')}:${String(utcDate.getUTCMinutes()).padStart(2, '0')}`,
    timezone,
    offsetMinutes: offsetMin,
  };
}
