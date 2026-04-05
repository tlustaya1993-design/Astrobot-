import React, { useMemo, useState } from 'react';
import { CalendarDays, Check, LogIn, MessageSquare, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
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
  const [search, setSearch] = useState('');
  const [editingConversationId, setEditingConversationId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const { data: conversations, isLoading } = useListOpenaiConversations({
    request: { headers: getAuthHeaders() },
  });

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

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (confirm('Удалить диалог?')) deleteMutation.mutate({ id });
  };

  const startEditing = (e: React.MouseEvent, id: number, title: string) => {
    e.stopPropagation();
    setEditingConversationId(id);
    setEditingTitle(title || 'Чтение');
  };

  const cancelEditing = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingConversationId(null);
    setEditingTitle('');
  };

  const saveEditing = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    const nextTitle = editingTitle.trim();
    if (!nextTitle) return;
    try {
      await updateMutation.mutateAsync({ id, data: { title: nextTitle } });
      setEditingConversationId(null);
      setEditingTitle('');
    } catch {
      // Keep editing mode open so user can retry.
    }
  };

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
              <p className="text-sm font-semibold leading-tight truncate">Профиль</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {isLoggedIn ? email : 'Настройки и данные'}
              </p>
            </div>
          </Link>
          {!isLoggedIn && (
            <button
              onClick={onLoginClick}
              className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-primary/30 text-primary text-xs font-medium hover:bg-primary/10 transition"
            >
              <LogIn className="w-3.5 h-3.5" />
              Войти / Зарегистрироваться
            </button>
          )}
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
          {isLoading ? (
            <div className="space-y-1 pt-1">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse" />
              ))}
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 px-4 text-center">
              <CalendarDays className="w-8 h-8 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">
                {search.trim() ? 'Ничего не найдено' : 'Диалогов пока нет'}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {filteredConversations.map((conv) => {
                const active = currentConversationId === conv.id;
                const isEditing = editingConversationId === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => openChat(conv.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left group transition ${
                      active
                        ? 'bg-primary/15 border border-primary/30'
                        : 'hover:bg-white/5 border border-transparent'
                    }`}
                  >
                    <div className="p-1.5 rounded-lg bg-secondary/60 border border-white/5 shrink-0">
                      <MessageSquare className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div
                          className="flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            value={editingTitle}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                const nextTitle = editingTitle.trim();
                                if (!nextTitle) return;
                                void updateMutation
                                  .mutateAsync({ id: conv.id, data: { title: nextTitle } })
                                  .then(() => {
                                    setEditingConversationId(null);
                                    setEditingTitle('');
                                  })
                                  .catch(() => {});
                              }
                              if (e.key === 'Escape') cancelEditing();
                            }}
                            className="flex-1 min-w-0 h-8 px-2.5 rounded-lg bg-background border border-primary/40 text-sm text-foreground outline-none focus:border-primary/70"
                            autoFocus
                          />
                          <button
                            onClick={(e) => void saveEditing(e, conv.id)}
                            className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/15 transition"
                            title="Сохранить"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5 transition"
                            title="Отмена"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <p className="text-sm font-medium text-foreground line-clamp-1">
                          {conv.title || 'Чтение'}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {format(new Date(conv.createdAt), 'd MMM, HH:mm', { locale: ru })}
                      </p>
                    </div>
                    {!isEditing && (
                      <button
                        onClick={(e) => startEditing(e, conv.id, conv.title || 'Чтение')}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0"
                        title="Переименовать"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDelete(e, conv.id)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 md:opacity-0 md:group-hover:opacity-100 transition-all shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
