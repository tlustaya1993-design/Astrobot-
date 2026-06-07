import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Mail, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import AuthModal from '@/components/AuthModal';
import { toast } from '@/hooks/use-toast';
import { getAuthHeaders } from '@/lib/session';
import { Input } from '@/components/ui/input';
import { isPlausibleReceiptEmail } from '@/lib/receipt-email';

const RECEIPT_EMAIL_STORAGE_KEY = 'astrobot_paywall_receipt_email';

const PACKAGES = [
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
] as const;

interface PaywallSheetProps {
  open: boolean;
  onClose: () => void;
  reason?: string;
}

export default function PaywallSheet({ open, onClose, reason }: PaywallSheetProps) {
  const { isLoggedIn, email } = useAuth();
  const [selectedCode, setSelectedCode] = useState<(typeof PACKAGES)[number]['code'] | null>('pack10');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [guestReceiptEmail, setGuestReceiptEmail] = useState('');

  useEffect(() => {
    if (!open || isLoggedIn) return;
    try {
      const saved = localStorage.getItem(RECEIPT_EMAIL_STORAGE_KEY);
      if (saved) setGuestReceiptEmail(saved);
    } catch {
      /* ignore */
    }
  }, [open, isLoggedIn]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setShowAuthModal(false);
  }, [open]);

  const selected = useMemo(
    () => PACKAGES.find((p) => p.code === selectedCode) ?? null,
    [selectedCode],
  );

  const handlePay = async () => {
    if (!selected || loading) return;
    setError(null);
    if (!isLoggedIn) {
      if (!isPlausibleReceiptEmail(guestReceiptEmail)) {
        setError('Введите email для чека (как в ЮKassa). Регистрация не нужна.');
        return;
      }
    }
    setLoading(true);
    try {
      const returnUrl = `${window.location.origin}/chat?payment=success`;
      try {
        if (!isLoggedIn && guestReceiptEmail.trim()) {
          localStorage.setItem(RECEIPT_EMAIL_STORAGE_KEY, guestReceiptEmail.trim().toLowerCase());
        }
      } catch {
        /* ignore */
      }
      const res = await fetch('/api/billing/payments/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          packageCode: selected.code,
          returnUrl,
          ...(!isLoggedIn ? { receiptEmail: guestReceiptEmail.trim() } : {}),
        }),
      });
      if (!res.ok) throw new Error('Не удалось создать платёж');
      const data = (await res.json()) as { confirmationUrl?: string | null };
      if (!data.confirmationUrl) throw new Error('Не пришла ссылка на оплату');
      window.location.href = data.confirmationUrl;
    } catch {
      setError('Не удалось открыть оплату. Попробуйте ещё раз.');
      setLoading(false);
    }
  };

  const handleAuthClose = () => {
    setShowAuthModal(false);
    if (isLoggedIn) {
      toast({
        title: 'Вы вошли в аккаунт',
        description:
          'История и память сохраняются и синхронизируются между устройствами. Можно оплатить пакет.',
      });
    }
  };

  const sheet = (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Закрыть окно тарифов"
            className="fixed inset-0 z-[400] bg-black/65 backdrop-blur-sm cursor-default"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-[410] flex justify-center pointer-events-none"
            style={{ maxHeight: 'min(92dvh, var(--vvh, 100dvh))' }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
          >
            <div className="pointer-events-auto w-full max-w-xl rounded-t-3xl border border-border bg-card shadow-2xl flex flex-col max-h-[inherit]">
              <div className="shrink-0 relative px-5 pt-3 pb-2 border-b border-border/40">
                <div className="flex justify-center">
                  <div className="w-10 h-1 rounded-full bg-border" />
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute right-3 top-2.5 p-2 rounded-full hover:bg-white/5 text-muted-foreground transition touch-manipulation"
                  aria-label="Закрыть"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-7 pb-safe">
                <div className="space-y-4 pt-2">
                  <div>
                    <h3 className="text-lg font-semibold font-display">Продолжим после пополнения</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Выберите пакет и оплатите через YooKassa. Вход не обязателен — запросы привязываются к этому устройству.
                    </p>
                    {!isLoggedIn && (
                      <div className="mt-3 space-y-1.5">
                        <label className="text-xs text-muted-foreground" htmlFor="paywall-receipt-email">
                          Email для чека в ЮKassa
                        </label>
                        <Input
                          id="paywall-receipt-email"
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          placeholder="you@example.com"
                          value={guestReceiptEmail}
                          onChange={(e) => setGuestReceiptEmail(e.target.value)}
                          icon={<Mail className="size-5" />}
                        />
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          Кстати: когда захотите, можно оформить аккаунт с этого же устройства — баланс и история останутся с вами. Не обязательно сразу.
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowAuthModal(true)}
                          className="text-xs text-primary hover:text-primary/80 underline underline-offset-2"
                        >
                          Уже есть аккаунт — войти или создать пароль
                        </button>
                      </div>
                    )}
                    {isLoggedIn && email && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Чек будет отправлен на: <span className="text-foreground">{email}</span>
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    {PACKAGES.map((pkg) => {
                      const active = selectedCode === pkg.code;
                      return (
                        <button
                          key={pkg.code}
                          type="button"
                          onClick={() => setSelectedCode(pkg.code)}
                          className={`w-full text-left rounded-2xl border p-4 transition ${
                            active
                              ? 'border-primary bg-primary/10 shadow-[0_0_18px_rgba(212,175,55,0.22)]'
                              : 'border-border/50 hover:border-primary/30 hover:bg-white/5'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-foreground">{pkg.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">{pkg.subtitle}</p>
                            </div>
                            <p className={`font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>{pkg.price}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {error && (
                    <p className="text-xs text-red-400">{error}</p>
                  )}
                  {reason && !error && (
                    <p className="text-xs text-muted-foreground">{reason}</p>
                  )}

                  <button
                    type="button"
                    onClick={handlePay}
                    disabled={!selected || loading}
                    className={`w-full py-3 rounded-2xl font-semibold transition inline-flex items-center justify-center gap-2 touch-manipulation ${
                      selected
                        ? 'bg-gradient-to-r from-[#D4AF37] to-[#F4D58D] text-[#1E1A0F] shadow-[0_0_20px_rgba(212,175,55,0.35)] hover:brightness-105'
                        : 'bg-muted text-muted-foreground'
                    } disabled:opacity-60`}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {selected
                      ? `Оплатить — ${selected.title} · ${selected.price}`
                      : 'Оплатить'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
          <AuthModal open={showAuthModal} onClose={handleAuthClose} initialTab="register" />
        </>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(sheet, document.body);
}
