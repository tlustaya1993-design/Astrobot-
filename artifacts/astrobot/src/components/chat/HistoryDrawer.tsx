import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CalendarDays, LogIn } from 'lucide-react';
import { useLocation } from 'wouter';
import {
  useListOpenaiConversations,
  useDeleteOpenaiConversation,
  useUpdateOpenaiConversation,
  getListOpenaiConversationsQueryKey,
} from '@workspace/api-client-react';
import { getAuthHeaders } from '@/lib/session';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import ConversationHistoryRow from '@/components/chat/ConversationHistoryRow';
import { useAvatarSync } from '@/context/AvatarSyncContext';
import { toast } from '@/hooks/use-toast';
import PaywallSheet from '@/components/billing/PaywallSheet';
import {
  ChatMenuHero,
  ChatMenuNewChatButton,
  ChatMenuSectionTitle,
  ChatMenuSubscriptionCard,
  ChatMenuCloseButton,
  ChatMenuAtmosphere,
  MENU_EASE,
  MENU_PANEL_CLASS,
} from '@/components/chat/menu/ChatMenuPrimitives';

interface Props {
  open: boolean;
  onClose: () => void;
  onLoginClick: () => void;
}

const DRAWER_BOTTOM = 'calc(2.5rem + env(safe-area-inset-bottom, 0px))';

export default function HistoryDrawer({ open, onClose, onLoginClick }: Props) {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { isLoggedIn, email } = useAuth();
  const { avatarConfig } = useAvatarSync();
  const [profileName, setProfileName] = useState<string>('');
  const [showPaywall, setShowPaywall] = useState(false);
  const [editingConversationId, setEditingConversationId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

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

  const updateMutation = useUpdateOpenaiConversation({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() }),
    },
  });

  const handleDelete = (id: number) => {
    if (confirm('Удалить диалог?')) deleteMutation.mutate({ id });
  };

  const openChat = (id?: number) => {
    onClose();
    setLocation(id ? `/chat/${id}` : '/chat');
  };

  const startEditing = (id: number, title: string) => {
    setEditingConversationId(id);
    setEditingTitle(title || 'Чтение');
  };

  const cancelEditing = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingConversationId(null);
    setEditingTitle('');
  };

  const saveEditing = async (id: number) => {
    const nextTitle = editingTitle.trim();
    if (!nextTitle) return;
    try {
      await updateMutation.mutateAsync({ id, data: { title: nextTitle } });
      setEditingConversationId(null);
      setEditingTitle('');
    } catch (err) {
      console.error('update conversation title failed', err);
      toast({
        title: 'Имя чата не сохранилось',
        description: 'Проверьте связь и попробуйте ещё раз — иногда мешает короткий сбой сети.',
      });
    }
  };

  useEffect(() => {
    if (!open) return;
    const loadName = async () => {
      try {
        const res = await fetch('/api/users/me', { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = (await res.json()) as { name?: string | null };
        setProfileName((data.name || '').trim());
      } catch {
        /* ignore */
      }
    };
    void loadName();
  }, [open]);

  const touchX = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx < -60) onClose();
  };

  const drawer = (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="history-drawer-backdrop"
            className="fixed inset-0 z-[150] bg-black/55 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: MENU_EASE }}
            onClick={onClose}
            aria-hidden
          />

          <motion.div
            key="history-drawer-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Меню чатов"
            className={`fixed top-0 left-0 z-[151] flex min-h-0 w-[min(340px,86vw)] max-w-[90vw] will-change-transform ${MENU_PANEL_CLASS} pt-safe`}
            style={{ bottom: DRAWER_BOTTOM }}
            initial={false}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.32, ease: MENU_EASE }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            <ChatMenuAtmosphere />
            <ChatMenuCloseButton onClose={onClose} />

            <motion.div className="relative z-[1] flex min-h-0 flex-1 flex-col">
              <ChatMenuHero
                profileName={profileName}
                email={email}
                isLoggedIn={isLoggedIn}
                avatarConfig={avatarConfig}
                onNavigate={onClose}
              />

              <ChatMenuNewChatButton onClick={() => openChat()} />

              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {hasConversations && <ChatMenuSectionTitle>Недавние диалоги</ChatMenuSectionTitle>}

                <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
                  {isLoading && hasConversations ? (
                    <div className="space-y-3 pt-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="h-[72px] rounded-[22px] animate-pulse"
                          style={{
                            background:
                              'linear-gradient(168deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                            boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                          }}
                        />
                      ))}
                    </div>
                  ) : !conversations?.length ? (
                    <div className="flex flex-col items-center justify-center px-2 py-16 text-center">
                      <CalendarDays className="mb-3 h-8 w-8 text-foreground/25" strokeWidth={1.5} />
                      <p className="text-sm font-medium text-foreground/85">Пока без диалогов</p>
                      <p className="mt-1.5 max-w-[220px] text-xs leading-relaxed text-foreground/40">
                        Начните с «Новый диалог» — название подберётся по смыслу первого вопроса.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {conversations.map((conv, index) => (
                        <ConversationHistoryRow
                          key={conv.id}
                          index={index}
                          conv={conv}
                          userAvatarConfig={avatarConfig}
                          isEditing={editingConversationId === conv.id}
                          editingTitle={editingTitle}
                          onEditingTitleChange={setEditingTitle}
                          onOpen={() => openChat(conv.id)}
                          onSaveEdit={() => void saveEditing(conv.id)}
                          onCancelEdit={() => cancelEditing()}
                          onRequestRename={() => startEditing(conv.id, conv.title || 'Чтение')}
                          onRequestDelete={() => handleDelete(conv.id)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="relative z-[1] shrink-0 space-y-2.5 border-t border-white/[0.03] px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {!isLoggedIn && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onLoginClick();
                    }}
                    className="flex w-full items-center justify-center gap-2 rounded-[18px] border border-white/[0.08] py-2.5 text-[13px] font-medium text-foreground/70 transition-colors hover:bg-white/[0.04]"
                  >
                    <LogIn className="h-4 w-4" strokeWidth={1.75} />
                    Войти / Зарегистрироваться
                  </button>
                )}
                <ChatMenuSubscriptionCard
                  onClick={() => {
                    onClose();
                    setShowPaywall(true);
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  const body = typeof document !== 'undefined' ? document.body : null;

  return (
    <>
      {body ? createPortal(drawer, body) : null}
      <PaywallSheet open={showPaywall} onClose={() => setShowPaywall(false)} />
    </>
  );
}
