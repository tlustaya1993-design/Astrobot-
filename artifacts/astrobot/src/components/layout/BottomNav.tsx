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
          data-onboarding-target="history-menu"
          onClick={onChatsClick}
          className={`flex-1 flex flex-col items-center justify-center gap-1 pt-3 pb-3 transition-colors touch-manipulation ${
            activeTab === 'chats' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-none">Чаты</span>
        </button>
        <button
          type="button"
          onClick={onProfileClick}
          className={`flex-1 flex flex-col items-center justify-center gap-1 pt-3 pb-3 transition-colors touch-manipulation ${
            activeTab === 'profile' ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] font-medium leading-none">Профиль</span>
        </button>
      </div>
      <div className="pb-safe" />
    </div>
  );
}
