import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, LogIn, Plus, Search } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import {
  getListOpenaiConversationsQueryKey,
  useDeleteOpenaiConversation,
  useListOpenaiConversations,
  useUpdateOpenaiConversation,
} from '@workspace/api-client-react';
import { getAuthHeaders } from '@/lib/session';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import IllustratedAvatar from '@/components/ui/IllustratedAvatar';
import { useAvatarSync } from '@/context/AvatarSyncContext';
import ConversationHistoryRow from '@/components/chat/ConversationHistoryRow';
import PaywallSheet from '@/components/billing/PaywallSheet';
import { toast } from '@/hooks/use-toast';

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
      <aside className={`h-full w-full border-r border-border/60 bg-card/40 backdrop-blur-sm flex flex-col ${className ?? ''}`}>
        <div className="p-3 border-b border-border/50">
          {headerRight && (
            <div className="mb-2 flex justify-end">
              {headerRight}
            </div>
          )}
          <Link
            href="/profile"
            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition"
          >
            <div className="w-10 h-10 rounded-full overflow-hidden border border-primary/30 shrink-0">
              <IllustratedAvatar config={avatarConfig} size={40} relaxedCrop />
            </div>
            <div className="text-left min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight truncate">{profileName || 'Профиль'}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {isLoggedIn ? email : 'Гостевой профиль'}
              </p>
              {!isLoggedIn && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Зарегистрируйся — и AstroBot будет помнить, о чём вы говорили.
                </p>
              )}
            </div>
          </Link>
        </div>

        <div className="p-3 border-b border-border/40 space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск чатов..."
              className="w-full bg-background border border-border rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-primary/50"
            />
          </div>
          <button
            onClick={() => openChat()}
            className="w-full flex items-center gap-2 py-2.5 px-3 rounded-xl bg-primary/15 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/25 transition"
          >
            <Plus className="w-4 h-4" />
            Новый диалог
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading && hasConversations ? (
            <div className="space-y-1 pt-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 px-4 text-center">
              <CalendarDays className="w-8 h-8 text-muted-foreground mb-3" />
              {search.trim() ? (
                <>
                  <p className="text-sm font-medium text-foreground/90">По запросу ничего не нашлось</p>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    Сбросьте поиск или попробуйте другое слово из названия чата.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-foreground/90">Пока без диалогов</p>
                  <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                    Нажмите «Новый диалог» — название подберётся по смыслу первого вопроса.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredConversations.map((conv) => (
                <ConversationHistoryRow
                  key={conv.id}
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
        <div className="p-3 border-t border-border/50 space-y-2">
          {!isLoggedIn && (
            <button
              onClick={onLoginClick}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-primary/30 text-primary text-xs font-medium hover:bg-primary/10 transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              Войти / Зарегистрироваться
            </button>
          )}
          <button
            onClick={() => setShowPaywall(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary/15 border border-primary/30 text-primary text-sm font-medium hover:bg-primary/25 transition"
          >
            Хочу больше разборов
          </button>
        </div>
      </aside>
      <PaywallSheet open={showPaywall} onClose={() => setShowPaywall(false)} />
    </>
  );
}
