import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, MessageSquare, Trash2, CalendarDays, LogIn } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useLocation } from 'wouter';
import {
  useListOpenaiConversations,
  useDeleteOpenaiConversation,
  getListOpenaiConversationsQueryKey,
} from '@workspace/api-client-react';
import { getAuthHeaders } from '@/lib/session';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import AstroAvatar, { loadAvatar, type AvatarConfig } from '@/components/ui/AstroAvatar';

const CONTACT_COLORS = [
  'from-violet-500 to-purple-700',
  'from-rose-500 to-pink-700',
  'from-sky-500 to-blue-700',
  'from-emerald-500 to-teal-700',
  'from-amber-500 to-orange-700',
];

function getContactColor(id: number) {
  return CONTACT_COLORS[id % CONTACT_COLORS.length];
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function SynastryAvatar({ contactId, contactName, userAvatar }: {
  contactId: number;
  contactName: string;
  userAvatar: AvatarConfig | null;
}) {
  return (
    <div className="relative w-10 h-6 shrink-0">
      {/* User avatar (behind, left) */}
      <div className="absolute left-0 top-0 w-6 h-6 rounded-full overflow-hidden border-2 border-card z-0">
        <AstroAvatar config={userAvatar} size={24} />
      </div>
      {/* Contact circle (in front, right) */}
      <div className={`absolute right-0 top-0 w-6 h-6 rounded-full bg-gradient-to-br ${getContactColor(contactId)} border-2 border-card z-10 flex items-center justify-center`}>
        <span className="text-[8px] font-bold text-white leading-none">{getInitials(contactName)}</span>
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  onLoginClick: () => void;
}

export default function HistoryDrawer({ open, onClose, onLoginClick }: Props) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { isLoggedIn, email } = useAuth();
  const avatar = React.useMemo(() => loadAvatar(), [open]);

  const { data: conversations, isLoading } = useListOpenaiConversations({
    request: { headers: getAuthHeaders() },
    query: { enabled: open },
  });

  const deleteMutation = useDeleteOpenaiConversation({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() }),
    },
  });

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm('Удалить диалог?')) deleteMutation.mutate({ id });
  };

  const openChat = (id?: number) => {
    onClose();
    setLocation(id ? `/chat/${id}` : '/chat');
  };

  // Swipe-left to close
  const touchX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx < -60) onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            className="fixed top-0 left-0 bottom-0 z-50 w-[82%] max-w-sm flex flex-col bg-card border-r border-border shadow-2xl pt-safe"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-border/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden border border-primary/30 shrink-0">
                  <AstroAvatar config={avatar} size={40} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight truncate">
                    {isLoggedIn ? email : 'Анонимный сеанс'}
                  </p>
                  <p className="text-[11px] text-muted-foreground">AstroBot</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-white/5 text-muted-foreground transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* New chat button */}
            <div className="px-3 py-3 border-b border-border/30">
              <button
                onClick={() => openChat()}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-primary/15 border border-primary/30 hover:bg-primary/25 transition-all text-primary text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Новый диалог
              </button>
            </div>

            {/* Conversations list */}
            <div className="flex-1 overflow-y-auto py-1">
              {isLoading ? (
                <div className="space-y-1 px-2 pt-2">
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} className="h-16 rounded-xl bg-white/5 animate-pulse" />
                  ))}
                </div>
              ) : !conversations?.length ? (
                <div className="flex flex-col items-center justify-center h-48 px-4 text-center">
                  <CalendarDays className="w-8 h-8 text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground">Диалогов пока нет</p>
                </div>
              ) : (
                <div className="space-y-0.5 px-2 pt-1">
                  {conversations.map(conv => {
                    const c = conv as typeof conv & { contactId?: number; contactName?: string; contactRelation?: string };
                    return (
                    <button
                      key={conv.id}
                      onClick={() => openChat(conv.id)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-all group text-left"
                    >
                      {c.contactId && c.contactName ? (
                        <SynastryAvatar
                          contactId={c.contactId}
                          contactName={c.contactName}
                          userAvatar={avatar}
                        />
                      ) : (
                      <div className="p-1.5 rounded-lg bg-secondary/60 border border-white/5 group-hover:border-primary/20 shrink-0">
                        <MessageSquare className="w-4 h-4 text-primary" />
                      </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground line-clamp-1">
                          {conv.title || 'Чтение'}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {format(new Date(conv.createdAt), 'd MMM, HH:mm', { locale: ru })}
                        </p>
                      </div>
                      <button
                        onClick={(e) => handleDelete(e, conv.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </button>
                  );
                  })}
                </div>
              )}
            </div>

            {/* Footer — login CTA for anon users */}
            {!isLoggedIn && (
              <div className="px-4 py-4 border-t border-border/50">
                <button
                  onClick={() => { onClose(); onLoginClick(); }}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-medium hover:bg-primary/10 transition"
                >
                  <LogIn className="w-4 h-4" />
                  Войти / Зарегистрироваться
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
