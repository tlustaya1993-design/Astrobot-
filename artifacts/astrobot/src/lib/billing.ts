import { getAuthHeaders } from '@/lib/session';

export type BillingPackageCode = 'pack10' | 'pack50' | 'pack100';

export const BILLING_PACKAGES: Array<{
  code: BillingPackageCode;
  title: string;
  subtitle: string;
  price: string;
}> = [
  {
    code: 'pack10',
    title: '10 запросов',
    subtitle: 'Подходит для быстрого продолжения диалога',
    price: '399 ₽',
  },
  {
    code: 'pack50',
    title: '50 запросов',
    subtitle: 'Оптимально для регулярного использования',
    price: '1499 ₽',
  },
  {
    code: 'pack100',
    title: '100 запросов',
    subtitle: 'Максимально выгодный пакет',
    price: '2499 ₽',
  },
];

export async function createPayment(packageCode: BillingPackageCode): Promise<{ confirmationUrl: string }> {
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
