import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, ImagePlus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAuthHeaders, getSessionId } from '@/lib/session';
import { toast } from '@/hooks/use-toast';

interface SupportModalProps {
  open: boolean;
  onClose: () => void;
  /** Текущий диалог, если окно открыто из чата. */
  conversationId?: number | null;
}

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB

export default function SupportModal({ open, onClose, conversationId }: SupportModalProps) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [portalReady, setPortalReady] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (open) {
      setText('');
      setError('');
      setFile(null);
      setPreviewUrl(null);
    }
  }, [open]);

  // Освобождаем object URL превью при смене файла / размонтировании.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handlePickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    if (!ALLOWED_TYPES.includes(picked.type)) {
      setError('Поддерживаются только изображения JPG, PNG или WEBP.');
      return;
    }
    if (picked.size > MAX_FILE_BYTES) {
      setError('Файл слишком большой. Максимум 8 МБ.');
      return;
    }
    setError('');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
  };

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!text.trim()) {
      setError('Опишите, что произошло.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('text', text.trim());
      formData.append('sessionId', getSessionId());
      if (conversationId != null) formData.append('conversationId', String(conversationId));
      if (file) formData.append('screenshot', file);

      // Внимание: не задаём Content-Type вручную — браузер сам проставит
      // multipart-boundary. getAuthHeaders даёт только auth-заголовки.
      const res = await fetch('/api/support/urgent', {
        method: 'POST',
        headers: { ...getAuthHeaders() },
        body: formData,
      });
      if (!res.ok) throw new Error('request_failed');

      onClose();
      toast({
        title: 'Запрос отправлен',
        description: 'Мы получили обращение и скоро разберёмся. Спасибо! ❤️',
        duration: 4000,
      });
    } catch {
      setError('Не удалось отправить запрос. Проверьте соединение и попробуйте снова.');
    } finally {
      setLoading(false);
    }
  };

  if (!portalReady || typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[320] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !loading) onClose();
          }}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="w-full max-w-lg max-h-[min(92dvh,720px)] flex flex-col bg-card border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl outline-none"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-modal-title"
          >
            <div className="shrink-0 flex items-center justify-between border-b border-border/50 px-5 py-4">
              <h3 id="support-modal-title" className="text-lg font-display font-semibold pr-2">
                Обратиться в поддержку
              </h3>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="p-2 rounded-full hover:bg-white/5 text-muted-foreground shrink-0 touch-manipulation disabled:opacity-50"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] touch-pan-y">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="support-text" className="text-xs text-muted-foreground mb-1 block">
                    Что произошло?
                  </label>
                  <textarea
                    id="support-text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={5}
                    placeholder="Опишите проблему как можно подробнее: что вы делали и что пошло не так."
                    className="w-full resize-none bg-background border border-border rounded-xl px-4 py-3 text-base text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                  />
                </div>

                <div>
                  <span className="text-xs text-muted-foreground mb-1 block">
                    Скриншот (необязательно)
                  </span>

                  {previewUrl ? (
                    <div className="relative inline-block">
                      <img
                        src={previewUrl}
                        alt="Предпросмотр вложения"
                        className="max-h-48 rounded-xl border border-border object-contain"
                      />
                      <button
                        type="button"
                        onClick={clearFile}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition touch-manipulation"
                        aria-label="Удалить вложение"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-dashed border-border text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition touch-manipulation"
                    >
                      <ImagePlus className="w-4 h-4" />
                      Прикрепить изображение
                    </button>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePickFile}
                    className="hidden"
                  />
                  <p className="text-[11px] text-muted-foreground/70 mt-1.5">
                    JPG, PNG или WEBP, до 8 МБ.
                  </p>
                </div>

                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="flex-1 py-3 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-white/5 transition disabled:opacity-50 touch-manipulation"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-60 transition touch-manipulation"
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {loading ? 'Отправка…' : 'Отправить'}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
