import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ArrowLeft, LifeBuoy, Loader2, Send } from "lucide-react";
import { getAuthHeaders, getSessionId } from "@/lib/session";

type TicketListItem = {
  id: number;
  publicId: string;
  status: string;
  description: string;
  bridgeOpen: boolean;
  createdAt: string;
  updatedAt: string;
};

type SupportMessage = {
  id: number;
  role: string;
  content: string;
  source: string;
  createdAt: string;
};

type TicketDetail = TicketListItem & {
  expectedBehavior?: string | null;
  screenshotUrl?: string | null;
  n8nTicketId?: number | null;
};

const STATUS_RU: Record<string, string> = {
  open: "открыт",
  analyzing: "анализ",
  awaiting_owner: "у поддержки",
  need_info: "нужно уточнение",
  approved: "одобрен",
  rejected: "отклонён",
  manual: "ручной режим",
  fixing: "исправление",
  closed: "закрыт",
};

export default function SupportPage() {
  const [, setLocation] = useLocation();
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [description, setDescription] = useState("");
  const [expectedBehavior, setExpectedBehavior] = useState("");
  const [screenshotUrl, setScreenshotUrl] = useState("");
  const [reply, setReply] = useState("");

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/support/tickets", { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Не удалось загрузить обращения");
      const data = (await res.json()) as { tickets: TicketListItem[] };
      setTickets(data.tickets || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTicket = useCallback(async (id: number) => {
    setError(null);
    try {
      const res = await fetch(`/api/support/tickets/${id}`, { headers: getAuthHeaders() });
      if (!res.ok) throw new Error("Обращение не найдено");
      const data = (await res.json()) as { ticket: TicketDetail; messages: SupportMessage[] };
      setTicket(data.ticket);
      setMessages(data.messages || []);
      setActiveId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
    }
  }, []);

  useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    if (activeId == null) return;
    const t = window.setInterval(() => {
      void loadTicket(activeId);
    }, 8000);
    return () => window.clearInterval(t);
  }, [activeId, loadTicket]);

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          description: description.trim(),
          expectedBehavior: expectedBehavior.trim() || undefined,
          screenshotUrl: screenshotUrl.trim() || undefined,
          sessionId: getSessionId(),
        }),
      });
      if (!res.ok && res.status !== 202) throw new Error("Не удалось создать обращение");
      const data = (await res.json()) as {
        ticket: TicketDetail;
        intakeDelivered?: boolean;
      };
      setDescription("");
      setExpectedBehavior("");
      setScreenshotUrl("");
      if (data.intakeDelivered === false) {
        setError(
          "Обращение сохранено, но до поддержки пока не дошло. Можно дополнить его в переписке.",
        );
      }
      await loadTickets();
      await loadTicket(data.ticket.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setCreating(false);
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!activeId || !reply.trim()) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/support/tickets/${activeId}/messages`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: reply.trim() }),
      });
      if (!res.ok && res.status !== 202) throw new Error("Не удалось отправить сообщение");
      const data = (await res.json()) as { deliveredToOwner?: boolean };
      setReply("");
      if (data.deliveredToOwner === false) {
        setError("Сообщение сохранено, но уведомление владельцу не ушло. Попробуйте позже.");
      }
      await loadTicket(activeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-10 border-b border-border/40 bg-background/90 backdrop-blur px-4 py-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => (activeId != null ? setActiveId(null) : setLocation("/profile"))}
          className="p-2 rounded-full hover:bg-white/5 touch-manipulation"
          aria-label="Назад"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display font-semibold truncate flex items-center gap-2">
            <LifeBuoy className="w-4 h-4 text-primary" />
            Поддержка
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {activeId != null ? `Обращение #${activeId}` : "Опишите проблему и переписывайтесь здесь"}
          </p>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {error && (
          <p className="mb-3 text-sm text-destructive rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2">
            {error}
          </p>
        )}

        {activeId == null ? (
          <div className="space-y-6 max-w-lg mx-auto">
            <form onSubmit={createTicket} className="space-y-3 rounded-2xl border border-border/50 bg-white/[0.02] p-4">
              <p className="text-sm font-medium">Новое обращение</p>
              <label className="block space-y-1.5">
                <span className="text-xs text-muted-foreground">Что случилось</span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  required
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                  placeholder="Кратко опишите проблему"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs text-muted-foreground">Как должно работать</span>
                <textarea
                  value={expectedBehavior}
                  onChange={(e) => setExpectedBehavior(e.target.value)}
                  rows={2}
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                  placeholder="Опционально"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs text-muted-foreground">Ссылка на скриншот</span>
                <input
                  value={screenshotUrl}
                  onChange={(e) => setScreenshotUrl(e.target.value)}
                  className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:border-primary/50"
                  placeholder="https://… (опционально)"
                />
              </label>
              <button
                type="submit"
                disabled={creating || !description.trim()}
                className="w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-50 touch-manipulation inline-flex items-center justify-center gap-2"
              >
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Отправить в поддержку
              </button>
            </form>

            <div className="space-y-2">
              <p className="text-sm font-medium">Мои обращения</p>
              {loading ? (
                <p className="text-xs text-muted-foreground py-4">Загрузка…</p>
              ) : tickets.length === 0 ? (
                <p className="text-xs text-muted-foreground">Пока пусто — создайте первое обращение выше.</p>
              ) : (
                tickets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void loadTicket(t.id)}
                    className="w-full text-left rounded-xl border border-border/40 bg-white/[0.02] px-3 py-3 hover:bg-white/[0.04] touch-manipulation"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">#{t.id}</span>
                      <span className="text-[11px] text-primary">
                        {STATUS_RU[t.status] || t.status}
                        {t.bridgeOpen ? " · ждёт ответа" : ""}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                  </button>
                ))
              )}
            </div>

            <p className="text-[11px] text-muted-foreground text-center">
              Или откройте{" "}
              <Link href="/profile" className="text-primary underline-offset-2 hover:underline">
                профиль
              </Link>
            </p>
          </div>
        ) : (
          <div className="max-w-lg mx-auto flex flex-col gap-3 min-h-[60dvh]">
            {ticket && (
              <div className="rounded-xl border border-border/40 bg-white/[0.02] px-3 py-2 text-xs text-muted-foreground">
                Статус: <span className="text-foreground">{STATUS_RU[ticket.status] || ticket.status}</span>
                {ticket.bridgeOpen ? " · поддержка ждёт ваш ответ" : ""}
              </div>
            )}

            <div className="flex-1 space-y-2">
              {messages.map((m) => {
                const isUser = m.role === "user";
                const isOwner = m.role === "owner";
                return (
                  <div
                    key={m.id}
                    className={`rounded-2xl px-3 py-2 text-sm max-w-[92%] whitespace-pre-wrap ${
                      isUser
                        ? "ml-auto bg-primary/20 border border-primary/30"
                        : isOwner
                          ? "mr-auto bg-white/[0.06] border border-border/50"
                          : "mx-auto text-xs text-muted-foreground border border-border/30 bg-transparent"
                    }`}
                  >
                    {(isOwner || m.role === "system") && (
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                        {isOwner ? "Поддержка" : "Система"}
                      </p>
                    )}
                    {m.content}
                  </div>
                );
              })}
            </div>

            <form onSubmit={sendReply} className="sticky bottom-0 flex gap-2 pt-2 bg-background">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                className="flex-1 rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                placeholder="Написать в поддержку…"
              />
              <button
                type="submit"
                disabled={sending || !reply.trim()}
                className="rounded-xl bg-primary px-3 text-primary-foreground disabled:opacity-50 touch-manipulation"
                aria-label="Отправить"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
