import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  const [portalReady, setPortalReady] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const closeMenu = () => setMenuOpen(false);

  const clearPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  const openMenu = () => {
    window.getSelection()?.removeAllRanges();
    didLongPress.current = true;
    setMenuOpen(true);
  };

  const startPress = () => {
    didLongPress.current = false;
    clearPress();
    pressTimer.current = setTimeout(openMenu, LONG_PRESS_MS);
  };

  const handleClick = () => {
    if (didLongPress.current || isEditing || menuOpen) {
      didLongPress.current = false;
      return;
    }
    onOpen();
  };

  const displayTitle = conv.title?.trim() || 'Чтение';

  const actionMenu =
    menuOpen && portalReady
      ? createPortal(
          <>
            <div
              className="fixed inset-0 z-[280] bg-black/55 touch-none"
              style={{ WebkitTapHighlightColor: 'transparent' }}
              onClick={closeMenu}
              aria-hidden
            />
            <div
              className="fixed left-3 right-3 bottom-4 z-[281] rounded-2xl border border-border bg-card p-2 shadow-2xl pb-[max(0.5rem,env(safe-area-inset-bottom))]"
              role="dialog"
              aria-label="Действия с диалогом"
            >
              <div className="flex items-start gap-2 px-2 py-1.5 border-b border-border/40 mb-1">
                <p className="flex-1 min-w-0 text-sm font-medium text-foreground line-clamp-2 pr-1">
                  {displayTitle}
                </p>
                <button
                  type="button"
                  onClick={closeMenu}
                  className="shrink-0 p-2 -m-1 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition touch-manipulation"
                  aria-label="Закрыть"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <button
                type="button"
                className="w-full text-left px-3 py-3 rounded-xl text-sm hover:bg-white/5 transition touch-manipulation"
                onClick={() => {
                  closeMenu();
                  onRequestRename();
                }}
              >
                Переименовать
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-3 rounded-xl text-sm text-destructive hover:bg-destructive/10 transition touch-manipulation"
                onClick={() => {
                  closeMenu();
                  onRequestDelete();
                }}
              >
                Удалить диалог
              </button>
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          openMenu();
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
        className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition select-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] touch-manipulation ${
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
                className="h-9 flex-1 min-w-0 px-2.5 rounded-lg bg-background border border-primary/40 text-base outline-none focus:border-primary/70 select-text"
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
              <p className="text-base font-semibold text-foreground leading-snug line-clamp-2 pr-1 pointer-events-none">
                {displayTitle}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1 pointer-events-none">
                {format(new Date(conv.createdAt), 'd MMM, HH:mm', { locale: ru })}
              </p>
            </>
          )}
        </div>
      </button>

      {actionMenu}
    </>
  );
}
