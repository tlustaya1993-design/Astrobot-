/** Согласовано с проверкой на API (billing): не fallback и не мусор. */
export function isPlausibleReceiptEmail(raw: string): boolean {
  const email = raw.trim().toLowerCase();
  if (email.length < 5 || !email.includes('@')) return false;
  if (email.startsWith('@') || email.endsWith('@')) return false;
  const [local, domain] = email.split('@');
  return Boolean(local && domain && domain.includes('.'));
}

/** Email для чека: ввод гостя → email из аккаунта (JWT/localStorage). */
export function resolveReceiptEmailForPayment(
  guestInput: string,
  authEmail: string | null | undefined,
): string {
  const guest = guestInput.trim().toLowerCase();
  if (isPlausibleReceiptEmail(guest)) return guest;
  const auth = authEmail?.trim().toLowerCase() ?? '';
  if (isPlausibleReceiptEmail(auth)) return auth;
  return '';
}
