import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';

const PACKAGES = [
  {
    code: 'pack10',
    title: '10 запросов',
    subtitle: 'Подходит для быстрого продолжения диалога',
    price: '399 ₽',
  },
] as const;

interface PaywallSheetProps {
  open: boolean;
  onClose: () => void;
}

export default function PaywallSheet({ open, onClose }: PaywallSheetProps) {
  const [selectedCode, setSelectedCode] = useState<(typeof PACKAGES)[number]['code'] | null>('pack10');
  const [loading, setLoading] = useState(false);
  const selected = useMemo(
    () => PACKAGES.find((p) => p.code === selectedCode) ?? null,
    [selectedCode],
  );

  const handlePay = async () => {
    if (!selected || loading) return;
    setLoading(true);
    try {
      const returnUrl = `${window.location.origin}/chat`;
      const res = await fetch('/api/billing/payments/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageCode: selected.code,
          returnUrl,
        }),
      });
      if (!res.ok) throw new Error('Не удалось создать платёж');
      const data = (await res.json()) as { confirmationUrl?: string | null };
      if (!data.confirmationUrl) throw new Error('Не пришла ссылка на оплату');
      window.location.href = data.confirmationUrl;
    } catch {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[120] bg-black/65 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-[130] flex justify-center"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 280 }}
          >
            <div className="w-full max-w-xl rounded-t-3xl border border-border bg-card px-5 pb-7 pt-3 shadow-2xl">
              <div className="mb-3 flex items-center justify-between">
                <div className="w-10 h-1 rounded-full bg-border mx-auto" />
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-white/5 text-muted-foreground transition"
                  aria-label="Закрыть"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold font-display">Продолжим после пополнения</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Выберите пакет запросов и оплатите через YooKassa в рублях.
                  </p>
                </div>

                <div className="space-y-2">
                  {PACKAGES.map((pkg) => {
                    const active = selectedCode === pkg.code;
                    return (
                      <button
                        key={pkg.code}
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

                <button
                  onClick={handlePay}
                  disabled={!selected || loading}
                  className={`w-full py-3 rounded-2xl font-semibold transition inline-flex items-center justify-center gap-2 ${
                    selected
                      ? 'bg-gradient-to-r from-[#D4AF37] to-[#F4D58D] text-[#1E1A0F] shadow-[0_0_20px_rgba(212,175,55,0.35)] hover:brightness-105'
                      : 'bg-muted text-muted-foreground'
                  } disabled:opacity-60`}
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Оплатить
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
