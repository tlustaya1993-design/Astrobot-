import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { MessageSquare, Check, X, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { DEFAULT_AVATAR, type AvatarConfig } from '@/components/ui/AstroAvatar';
import { SynastryRowAvatars } from '@/components/chat/SynastryRowAvatars';
import { MENU_EASE, conversationRowSurfaceStyle } from '@/components/chat/menu/ChatMenuPrimitives';

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
  index?: number;
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
  index = 0,
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
            <motion.div
              className="fixed inset-0 z-[280] bg-black/50 backdrop-blur-[2px] touch-none"
              onClick={closeMenu}
              aria-hidden
            />
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.32, ease: MENU_EASE }}
              className="fixed left-4 right-4 bottom-4 z-[281] rounded-[22px] border border-white/[0.06] bg-[#12101c]/95 p-2 shadow-[0_24px_60px_rgba(0,0,0,0.45)] pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl"
              role="dialog"
              aria-label="Действия с диалогом"
            >
              <div className="flex items-start gap-2 px-2 py-2 border-b border-white/[0.05] mb-1">
                <p className="flex-1 min-w-0 text-sm font-medium text-foreground/90 line-clamp-2 pr-1">
                  {displayTitle}
                </p>
                <button
                  type="button"
                  onClick={closeMenu}
                  className="shrink-0 rounded-full p-2 text-foreground/40 hover:bg-white/[0.06] hover:text-foreground/70 transition touch-manipulation"
                  aria-label="Закрыть"
                >
                  <X className="w-5 h-5" strokeWidth={1.75} />
                </button>
              </div>
              <button
                type="button"
                className="w-full text-left px-3 py-3 rounded-xl text-sm text-foreground/85 hover:bg-white/[0.04] transition touch-manipulation"
                onClick={() => {
                  closeMenu();
                  onRequestRename();
                }}
              >
                Переименовать
              </button>
              <button
                type="button"
                className="w-full text-left px-3 py-3 rounded-xl text-sm text-red-300/90 hover:bg-red-500/[0.08] transition touch-manipulation"
                onClick={() => {
                  closeMenu();
                  onRequestDelete();
                }}
              >
                Удалить диалог
              </button>
            </motion.div>
          </>,
          document.body,
        )
      : null;

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.38, ease: MENU_EASE, delay: 0.04 + index * 0.03 }}
      >
        <button
          type="button"
          onClick={handleClick}
          onContextMenu={(e) => {
            e.preventDefault();
            openMenu();
          }}
          onTouchStart={() => {
            if (!isEditing) startPress();
          }}
          onTouchEnd={clearPress}
          onTouchMove={clearPress}
          onTouchCancel={clearPress}
          onMouseDown={(e) => {
            if (e.button !== 0 || isEditing) return;
            startPress();
          }}
          onMouseUp={clearPress}
          onMouseLeave={clearPress}
          className="group relative w-full overflow-hidden rounded-[22px] text-left transition-all duration-300 select-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent] touch-manipulation hover:brightness-[1.03] active:brightness-[0.98]"
          style={conversationRowSurfaceStyle(active)}
        >
          <span
            className="pointer-events-none absolute inset-0 rounded-[22px] opacity-70"
            style={{
              background:
                'radial-gradient(ellipse 90% 55% at 50% 0%, rgba(255,255,255,0.05) 0%, transparent 62%)',
            }}
          />
          <span className="relative z-[1] flex w-full items-center gap-3.5 px-4 py-3.5">
          {conv.contactId != null && conv.contactId > 0 ? (
            <SynastryRowAvatars
              userConfig={userAvatarConfig ?? DEFAULT_AVATAR}
              contactAvatarConfig={conv.contactAvatarConfig}
              contactId={conv.contactId}
              contactName={conv.contactName}
              size={28}
              ringClassName="ring-[#12101c]"
            />
          ) : (
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              style={{
                background: 'linear-gradient(145deg, rgba(90,75,120,0.2) 0%, rgba(60,52,85,0.15) 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.05)',
              }}
            >
              <MessageSquare className="w-[18px] h-[18px] text-[rgba(175,165,200,0.7)]" strokeWidth={1.75} />
            </div>
          )}

          <div className="min-w-0 flex-1 pr-1">
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
                  className="h-9 flex-1 min-w-0 px-2.5 rounded-xl bg-[#0c0b12] border border-[rgba(255,215,120,0.25)] text-[15px] outline-none focus:border-[rgba(255,215,120,0.4)] select-text"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSaveEdit();
                  }}
                  className="p-1.5 rounded-lg text-emerald-400/90 hover:bg-emerald-500/10 transition shrink-0"
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
                  className="p-1.5 rounded-lg text-foreground/45 hover:bg-white/5 transition shrink-0"
                  aria-label="Отмена"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <p className="text-[15px] font-medium leading-snug text-foreground/92 line-clamp-3 pointer-events-none">
                  {displayTitle}
                </p>
                <p className="text-[12px] text-foreground/45 mt-1 pointer-events-none">
                  {format(new Date(conv.createdAt), 'd MMM, HH:mm', { locale: ru })}
                </p>
              </>
            )}
          </div>

          {!isEditing && (
            <ChevronRight
              className="w-4 h-4 shrink-0 text-foreground/20 pointer-events-none"
              strokeWidth={1.75}
            />
          )}
          </span>
        </button>
      </motion.div>

      {actionMenu}
    </>
  );
}
