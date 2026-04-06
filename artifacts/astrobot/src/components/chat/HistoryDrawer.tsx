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
import IllustratedAvatar from '@/components/ui/IllustratedAvatar';
import { SynastryRowAvatars } from '@/components/chat/SynastryRowAvatars';
import { useAvatarSync } from '@/context/AvatarSyncContext';

interface Props {
  open: boolean;
  onClose: () => void;
  onLoginClick: () => void;
}

export default function HistoryDrawer({ open, onClose, onLoginClick }: Props) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { isLoggedIn, email } = useAuth();
  const { avatarConfig } = useAvatarSync();

  const { data: conversations, isLoading } = useListOpenaiConversations({
    request: { headers: getAuthHeaders() },
    query: { enabled: open },
  });
  const hasConversations = (conversations?.length ?? 0) > 0;

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
                  <IllustratedAvatar config={avatarConfig} size={40} relaxedCrop />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight truncate">
                    {isLoggedIn ? email : 'Анонимный сеанс'}
                  </p>
                  {!isLoggedIn && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                      Зарегистрируйтесь, чтобы сохранить историю и контекст
                    </p>
                  )}
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
              {isLoading && hasConversations ? (
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
                  {conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => openChat(conv.id)}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/5 transition-all group text-left"
                    >
                      {conv.contactId != null && conv.contactId > 0 ? (
                        <SynastryRowAvatars
                          userConfig={avatarConfig}
                          contactAvatarConfig={conv.contactAvatarConfig}
                          contactId={conv.contactId}
                          contactName={conv.contactName}
                          size={28}
                          ringClassName="ring-card"
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
                  ))}
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
