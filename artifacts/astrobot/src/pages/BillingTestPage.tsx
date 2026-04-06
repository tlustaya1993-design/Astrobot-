import React, { useState } from 'react';
import { Link } from 'wouter';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { BILLING_PACKAGES, createPayment, type BillingPackageCode } from '@/lib/billing';
import { toast } from '@/hooks/use-toast';

/**
 * Страница для ручной проверки оплаты YooKassa.
 * Включается только при VITE_ENABLE_BILLING_TEST=true на этапе сборки.
 *
 * ЮKassa (тестовый магазин): https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing
 */
export default function BillingTestPage() {
  const { isLoggedIn, email } = useAuth();
  const [loading, setLoading] = useState<BillingPackageCode | null>(null);

  const handlePay = async (code: BillingPackageCode) => {
    if (!isLoggedIn) {
      toast({
        title: 'Нужен вход',
        description: 'Войдите по email — иначе нельзя создать платёж и привязать чек.',
        variant: 'destructive',
      });
      return;
    }
    setLoading(code);
    try {
      const { confirmationUrl } = await createPayment(code);
      window.location.href = confirmationUrl;
    } catch (e) {
      toast({
        title: 'Ошибка',
        description: e instanceof Error ? e.message : 'Не удалось создать платёж',
        variant: 'destructive',
      });
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-8 max-w-lg mx-auto">
      <h1 className="text-xl font-semibold font-display mb-1">Тест оплаты</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Тот же поток, что в paywall: запрос к <code className="text-xs bg-secondary/80 px-1 rounded">/api/billing/payments/create</code>
        и редирект на ЮKassa.
      </p>

      {!isLoggedIn ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm mb-6">
          Сначала{' '}
          <Link href="/chat" className="text-primary underline underline-offset-2">
            войдите
          </Link>
          — без авторизации платёж не создаётся.
        </div>
      ) : (
        <p className="text-xs text-muted-foreground mb-4">
          Аккаунт: <span className="text-foreground">{email}</span>
        </p>
      )}

      <div className="space-y-2 mb-8">
        {BILLING_PACKAGES.map((pkg) => (
          <button
            key={pkg.code}
            type="button"
            disabled={!isLoggedIn || loading !== null}
            onClick={() => void handlePay(pkg.code)}
            className="w-full flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-left hover:bg-secondary/30 disabled:opacity-50 transition"
          >
            <span className="font-medium">
              {pkg.title} · {pkg.subtitle}
            </span>
            <span className="text-primary font-semibold shrink-0">
              {loading === pkg.code ? <Loader2 className="w-4 h-4 animate-spin" /> : pkg.price}
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border/80 bg-card/50 p-4 text-xs text-muted-foreground space-y-3">
        <p>
          <strong className="text-foreground">Тестовый магазин:</strong> в Railway укажите shop_id и секретный ключ из{' '}
          <a
            href="https://yookassa.ru/my/merchant/integration/api-keys"
            className="text-primary underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            личного кабинета ЮKassa
          </a>{' '}
          в режиме «Тест».
        </p>
        <p>
          Карты для проверки — в{' '}
          <a
            href="https://yookassa.ru/developers/payment-acceptance/testing-and-going-live/testing"
            className="text-primary underline underline-offset-2"
            target="_blank"
            rel="noreferrer"
          >
            документации ЮKassa
          </a>
          .
        </p>
        <p>
          Выключается в проде: убери <code className="bg-background px-1 rounded">VITE_ENABLE_BILLING_TEST</code> из
          переменных сборки.
        </p>
      </div>

      <p className="mt-6">
        <Link href="/chat" className="text-sm text-primary underline underline-offset-2">
          ← Назад в чат
        </Link>
      </p>
    </div>
  );
}
