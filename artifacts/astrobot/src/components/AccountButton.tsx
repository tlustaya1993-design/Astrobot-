import React, { useState } from 'react';
import { User, LogOut, LogIn } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import AuthModal from './AuthModal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

export default function AccountButton() {
  const { isLoggedIn, email, logout } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'login' | 'register'>('login');

  if (!isLoggedIn) {
    return (
      <>
        <Button
          variant="ghost"
          size="sm"
          className="text-gray-400 hover:text-white hover:bg-white/10 gap-2"
          onClick={() => { setModalTab('login'); setModalOpen(true); }}
        >
          <LogIn className="w-4 h-4" />
          <span className="hidden sm:inline">Войти</span>
        </Button>
        <AuthModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          initialTab={modalTab}
        />
      </>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-gray-300 hover:text-white hover:bg-white/10 gap-2"
          >
            <User className="w-4 h-4" />
            <span className="hidden sm:inline max-w-[140px] truncate">{email}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="bg-[#1a1a2e] border-[#2a2a3d] text-white min-w-[200px]"
        >
          <DropdownMenuLabel className="text-gray-400 text-xs font-normal truncate">
            {email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-[#2a2a3d]" />
          <DropdownMenuItem
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer gap-2"
            onClick={logout}
          >
            <LogOut className="w-4 h-4" />
            Выйти
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AuthModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        initialTab={modalTab}
      />
    </>
  );
}
