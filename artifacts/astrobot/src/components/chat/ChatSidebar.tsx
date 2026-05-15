import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, LogIn, Search } from 'lucide-react';
import { useLocation } from 'wouter';
import {
  getListOpenaiConversationsQueryKey,
  useDeleteOpenaiConversation,
  useListOpenaiConversations,
  useUpdateOpenaiConversation,
} from '@workspace/api-client-react';
import { getAuthHeaders } from '@/lib/session';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useAvatarSync } from '@/context/AvatarSyncContext';
import ConversationHistoryRow from '@/components/chat/ConversationHistoryRow';
import PaywallSheet from '@/components/billing/PaywallSheet';
import { toast } from '@/hooks/use-toast';
import {
  ChatMenuHero,
  ChatMenuNewChatButton,
  ChatMenuSectionTitle,
  ChatMenuSubscriptionCard,
  ChatMenuAtmosphere,
  MENU_PANEL_CLASS,
} from '@/components/chat/menu/ChatMenuPrimitives';

interface ChatSidebarProps {
  currentConversationId?: number;
  onLoginClick: () => void;
  onNavigate?: () => void;
  className?: string;
  headerRight?: React.ReactNode;
}

export default function ChatSidebar({
  currentConversationId,
  onLoginClick,
  onNavigate,
  className,
  headerRight,
}: ChatSidebarProps) {
  const { avatarConfig } = useAvatarSync();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { isLoggedIn, email } = useAuth();
  const [profileName, setProfileName] = useState<string>('');
  const [showPaywall, setShowPaywall] = useState(false);
  const [search, setSearch] = useState('');
  const [editingConversationId, setEditingConversationId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const { data: conversations, isLoading } = useListOpenaiConversations({
    request: { headers: getAuthHeaders() },
  });
  const hasConversations = (conversations?.length ?? 0) > 0;

  const deleteMutation = useDeleteOpenaiConversation({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListOpenaiConversationsQueryKey(),
        });
      },
    },
  });

  const updateMutation = useUpdateOpenaiConversation({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListOpenaiConversationsQueryKey(),
        });
      },
    },
  });

  const filteredConversations = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return conversations ?? [];
    return (conversations ?? []).filter((c) =>
      (c.title || 'Чтение').toLowerCase().includes(normalized),
    );
  }, [conversations, search]);

  const openChat = (id?: number) => {
    setLocation(id ? `/chat/${id}` : '/chat');
    onNavigate?.();
  };

  const handleDelete = (id: number) => {
    if (confirm('Удалить диалог?')) deleteMutation.mutate({ id });
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
    } catch {
      toast({
        title: 'Имя чата не сохранилось',
        description: 'Проверьте связь и попробуйте ещё раз.',
      });
    }
  };

  useEffect(() => {
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
  }, []);

  return (
    <>
      <aside
        className={`relative h-full w-full ${MENU_PANEL_CLASS} ${className ?? ''}`}
      >
        <ChatMenuAtmosphere />
        <div className="relative z-[1] flex min-h-0 flex-1 flex-col">
        {headerRight && (
          <div className="flex justify-end px-3 pt-2">{headerRight}</div>
        )}

        <ChatMenuHero
          profileName={profileName}
          email={email}
          isLoggedIn={isLoggedIn}
          avatarConfig={avatarConfig}
          onNavigate={onNavigate}
        />

        <div className="space-y-2 px-5 pb-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/30"
              strokeWidth={1.75}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск диалогов..."
              className="w-full rounded-[18px] border border-white/[0.04] py-2.5 pl-9 pr-3 text-sm text-foreground/90 outline-none transition-colors placeholder:text-foreground/28 focus:border-[rgba(240,228,200,0.18)]"
              style={{
                background: 'linear-gradient(165deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.012) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            />
          </div>
          <ChatMenuNewChatButton embedded onClick={() => openChat()} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {hasConversations && !search.trim() && (
            <ChatMenuSectionTitle>Недавние диалоги</ChatMenuSectionTitle>
          )}
          {search.trim() ? (
            <p className="px-5 pb-2 pt-2 text-[11px] font-medium uppercase tracking-[0.14em] text-foreground/45">
              Результаты
            </p>
          ) : null}

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
            {isLoading && hasConversations ? (
              <div className="space-y-3 pt-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-[72px] rounded-[22px] bg-white/[0.03] animate-pulse" />
                ))}
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-2 py-16 text-center">
                <CalendarDays className="mb-3 h-8 w-8 text-foreground/25" strokeWidth={1.5} />
                {search.trim() ? (
                  <>
                    <p className="text-sm font-medium text-foreground/85">По запросу ничего не нашлось</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-foreground/40">
                      Сбросьте поиск или попробуйте другое слово из названия.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-foreground/85">Пока без диалогов</p>
                    <p className="mt-1.5 text-xs leading-relaxed text-foreground/40">
                      Нажмите «Новый диалог» — название подберётся по смыслу первого вопроса.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredConversations.map((conv, index) => (
                  <ConversationHistoryRow
                    key={conv.id}
                    index={index}
                    conv={conv}
                    active={currentConversationId === conv.id}
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

        <div className="shrink-0 space-y-2.5 border-t border-white/[0.05] px-4 py-4">
          {!isLoggedIn && (
            <button
              type="button"
              onClick={onLoginClick}
              className="flex w-full items-center justify-center gap-2 rounded-[18px] border border-white/[0.08] py-2.5 text-[13px] font-medium text-foreground/70 transition-colors hover:bg-white/[0.04]"
            >
              <LogIn className="h-4 w-4" strokeWidth={1.75} />
              Войти / Зарегистрироваться
            </button>
          )}
          <ChatMenuSubscriptionCard onClick={() => setShowPaywall(true)} />
        </div>
      </aside>
      <PaywallSheet open={showPaywall} onClose={() => setShowPaywall(false)} />
    </>
  );
}
