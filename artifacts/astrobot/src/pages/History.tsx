import React from 'react';
import { Link } from 'wouter';
import { MessageSquare, Trash2, CalendarDays } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { AppLayout } from '@/components/layout/AppLayout';
import { useListOpenaiConversations, useDeleteOpenaiConversation, getListOpenaiConversationsQueryKey } from '@workspace/api-client-react';
import { getAuthHeaders } from '@/lib/session';
import { useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';

export default function History() {
  const queryClient = useQueryClient();

  const { data: conversations, isLoading } = useListOpenaiConversations({
    request: { headers: getAuthHeaders() }
  });

  const deleteMutation = useDeleteOpenaiConversation({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
      }
    }
  });

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Удалить эту запись?')) {
      deleteMutation.mutate({ id });
    }
  };

  return (
    <AppLayout>
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-white/5 p-4 shadow-sm">
        <h2 className="font-display font-semibold text-2xl text-center">История чтений</h2>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-card/50 rounded-2xl animate-pulse border border-white/5" />
            ))}
          </div>
        ) : !conversations?.length ? (
          <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
            <div className="w-16 h-16 rounded-full bg-card border border-border flex items-center justify-center mb-4">
              <CalendarDays className="w-8 h-8 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-display font-medium mb-2">Пока ничего нет</h3>
            <p className="text-muted-foreground">Ваш космический путь только начинается. Начните новый диалог, чтобы сохранить первое чтение.</p>
            <Link href="/chat" className="mt-6 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">
              Начать чтение
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {conversations.map((conv) => (
                <motion.div
                  key={conv.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  layout
                >
                  <Link
                    href={`/chat/${conv.id}`}
                    className="block p-4 rounded-2xl bg-card border border-white/5 hover:border-primary/30 transition-all hover:bg-white/5 group relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-secondary/50 border border-white/5 group-hover:bg-primary/20 group-hover:border-primary/30 transition-colors">
                          <MessageSquare className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <h3 className="font-medium text-foreground line-clamp-1">{conv.title || 'Чтение'}</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(conv.createdAt), 'd MMM yyyy, HH:mm', { locale: ru })}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={(e) => handleDelete(e, conv.id)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        disabled={deleteMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
