import React, { useRef, useState } from 'react';
import { MessageSquare, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { DEFAULT_AVATAR, type AvatarConfig } from '@/components/ui/AstroAvatar';
import { SynastryRowAvatars } from '@/components/chat/SynastryRowAvatars';

export type ConversationListItem = {
  id: number;
  title?: string | null;
  createdAt: string;
  contactId?: number | null;
  contactName?: string | null;
  contactAvatarConfig?: AvatarConfig | null;
};

type Props = {
  conv: ConversationListItem;
  active?: boolean;
  userAvatarConfig: AvatarConfig | null;
  isEditing: boolean;
  editingTitle: string;
  onEditingTitleChange: (value: string) => void;
  onOpen: () => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRequestRename: () => void;
  onRequestDelete: () => void;
};

const LONG_PRESS_MS = 520;

export default function ConversationHistoryRow({
  conv,
  active = false,
  userAvatarConfig,
  isEditing,
  editingTitle,
  onEditingTitleChange,
  onOpen,
  onSaveEdit,
  onCancelEdit,
  onRequestRename,
  onRequestDelete,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const startPress = () => {
    didLongPress.current = false;
    clearPress();
    pressTimer.current = setTimeout(() => {
      didLongPress.current = true;
      setMenuOpen(true);
    }, LONG_PRESS_MS);
  };

  const handleClick = () => {
    if (didLongPress.current || isEditing || menuOpen) {
      didLongPress.current = false;
      return;
    }
    onOpen();
  };

  const displayTitle = conv.title?.trim() || 'Чтение';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
        onTouchStart={startPress}
        onTouchEnd={clearPress}
        onTouchMove={clearPress}
        onTouchCancel={clearPress}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          startPress();
        }}
        onMouseUp={clearPress}
        onMouseLeave={clearPress}
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition ${
          active
            ? 'bg-primary/15 border border-primary/30'
            : 'hover:bg-white/5 border border-transparent'
        }`}
      >
        {conv.contactId != null && conv.contactId > 0 ? (
          <SynastryRowAvatars
            userConfig={userAvatarConfig ?? DEFAULT_AVATAR}
            contactAvatarConfig={conv.contactAvatarConfig}
            contactId={conv.contactId}
            contactName={conv.contactName}
            size={26}
            ringClassName="ring-card"
          />
        ) : (
          <div className="p-1.5 rounded-lg bg-secondary/60 border border-white/5 shrink-0">
            <MessageSquare className="w-4 h-4 text-primary" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <input
                value={editingTitle}
                onChange={(e) => onEditingTitleChange(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    onSaveEdit();
                  }
                  if (e.key === 'Escape') onCancelEdit();
                }}
                className="h-9 flex-1 min-w-0 px-2.5 rounded-lg bg-background border border-primary/40 text-base outline-none focus:border-primary/70"
                autoFocus
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSaveEdit();
                }}
                className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/15 transition shrink-0"
                aria-label="Сохранить"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancelEdit();
                }}
                className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/5 transition shrink-0"
                aria-label="Отмена"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <p className="text-base font-semibold text-foreground leading-snug line-clamp-2 pr-1">
                {displayTitle}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {format(new Date(conv.createdAt), 'd MMM, HH:mm', { locale: ru })}
              </p>
            </>
          )}
        </div>
      </button>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-[55] bg-black/40"
            onClick={() => setMenuOpen(false)}
          />
          <div className="fixed left-3 right-3 bottom-4 z-[56] rounded-2xl border border-border bg-card p-2 shadow-2xl">
            <p className="px-3 py-2 text-xs text-muted-foreground line-clamp-2">{displayTitle}</p>
            <button
              type="button"
              className="w-full text-left px-3 py-3 rounded-xl text-sm hover:bg-white/5 transition"
              onClick={() => {
                setMenuOpen(false);
                onRequestRename();
              }}
            >
              Переименовать
            </button>
            <button
              type="button"
              className="w-full text-left px-3 py-3 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition"
              onClick={() => {
                setMenuOpen(false);
                onRequestDelete();
              }}
            >
              Удалить диалог
            </button>
            <button
              type="button"
              className="w-full text-center px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-white/5 transition"
              onClick={() => setMenuOpen(false)}
            >
              Отмена
            </button>
          </div>
        </>
      )}
    </>
  );
}
