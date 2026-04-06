import { getAuthHeaders } from '@/lib/session';

export type BillingPackageCode = 'pack10' | 'pack30' | 'pack50' | 'pack100';

export const BILLING_PACKAGES: Array<{
  code: BillingPackageCode;
  title: string;
  subtitle: string;
  price: string;
}> = [
  {
    code: 'pack10',
    title: 'Старт',
    subtitle: '10 запросов',
    price: '349 ₽',
  },
  {
    code: 'pack30',
    title: 'Стандарт',
    subtitle: '30 запросов',
    price: '799 ₽',
  },
  {
    code: 'pack50',
    title: 'Про',
    subtitle: '50 запросов',
    price: '1 149 ₽',
  },
  {
    code: 'pack100',
    title: 'Макс',
    subtitle: '100 запросов',
    price: '1 799 ₽',
  },
];

export async function createPayment(
  packageCode: BillingPackageCode,
  options?: { receiptEmail?: string },
): Promise<{ confirmationUrl: string }> {
  const returnUrl = `${window.location.origin}/chat?payment=success`;
  const res = await fetch('/api/billing/payments/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      packageCode,
      returnUrl,
      ...(options?.receiptEmail?.trim() ? { receiptEmail: options.receiptEmail.trim() } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error('Не удалось создать платёж');
  }

  const data = (await res.json()) as { confirmationUrl?: string | null };
  if (!data.confirmationUrl) {
    throw new Error('Не пришла ссылка на оплату');
  }

  return { confirmationUrl: data.confirmationUrl };
}
