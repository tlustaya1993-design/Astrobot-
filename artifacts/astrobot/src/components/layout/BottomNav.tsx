import React from 'react';
import { MessageSquare, User } from 'lucide-react';

interface BottomNavProps {
  activeTab: 'chats' | 'profile' | null;
  onChatsClick: () => void;
  onProfileClick: () => void;
}

export default function BottomNav({ activeTab, onChatsClick, onProfileClick }: BottomNavProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[60] bg-card/95 backdrop-blur-xl border-t border-border">
      <div className="flex">
        <button
          type="button"
          onClick={onChatsClick}
          aria-label="Чаты"
          className={`flex-1 flex items-center justify-center py-2.5 min-h-[44px] transition-colors touch-manipulation ${
            activeTab === 'chats' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
        </button>
        <button
          type="button"
          onClick={onProfileClick}
          aria-label="Профиль"
          className={`flex-1 flex items-center justify-center py-2.5 min-h-[44px] transition-colors touch-manipulation ${
            activeTab === 'profile' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <User className="w-5 h-5" />
        </button>
      </div>
      <div className="pb-safe" />
    </div>
  );
}
