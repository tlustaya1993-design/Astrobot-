import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import ChatSidebar from './ChatSidebar';

interface Props {
  open: boolean;
  onClose: () => void;
  onLoginClick: () => void;
}

export default function HistoryDrawer({ open, onClose, onLoginClick }: Props) {
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
            <ChatSidebar
              className="h-full border-none"
              onNavigate={onClose}
              onLoginClick={() => {
                onClose();
                onLoginClick();
              }}
              headerRight={
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:bg-white/5 text-muted-foreground transition"
                  aria-label="Закрыть"
                >
                  <X className="w-5 h-5" />
                </button>
              }
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
