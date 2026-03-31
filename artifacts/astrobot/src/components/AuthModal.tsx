import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { apiLogin, apiRegister } from '@/lib/auth';
import { getSessionId } from '@/lib/session';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  initialTab?: 'login' | 'register';
}

export default function AuthModal({ open, onClose, initialTab = 'login' }: AuthModalProps) {
  const { login } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>(initialTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let result;
      if (tab === 'register') {
        const currentSessionId = getSessionId();
        result = await apiRegister(email.trim(), password, currentSessionId);
      } else {
        result = await apiLogin(email.trim(), password);
      }
      login(result.token, result.sessionId, result.email);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (t: 'login' | 'register') => {
    setTab(t);
    setError(null);
    setPassword('');
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-[400px] bg-[#0f0f1a] border-[#2a2a3d] text-white">
        <DialogHeader>
          <DialogTitle className="text-center text-xl font-semibold text-white">
            {tab === 'login' ? 'Вход в аккаунт' : 'Регистрация'}
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex rounded-lg bg-[#1a1a2e] p-1 mb-4">
          <button
            type="button"
            className={`flex-1 py-2 text-sm rounded-md transition-colors ${
              tab === 'login'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
            onClick={() => switchTab('login')}
          >
            Вход
          </button>
          <button
            type="button"
            className={`flex-1 py-2 text-sm rounded-md transition-colors ${
              tab === 'register'
                ? 'bg-purple-600 text-white shadow'
                : 'text-gray-400 hover:text-white'
            }`}
            onClick={() => switchTab('register')}
          >
            Регистрация
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-gray-300">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="bg-[#1a1a2e] border-[#2a2a3d] text-white placeholder:text-gray-500 focus:border-purple-500"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password" className="text-gray-300">Пароль</Label>
            <Input
              id="password"
              type="password"
              placeholder={tab === 'register' ? 'Минимум 6 символов' : '••••••••'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              className="bg-[#1a1a2e] border-[#2a2a3d] text-white placeholder:text-gray-500 focus:border-purple-500"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center bg-red-500/10 rounded-md py-2 px-3">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium"
          >
            {loading
              ? 'Загрузка...'
              : tab === 'login' ? 'Войти' : 'Создать аккаунт'}
          </Button>

          {tab === 'register' && (
            <p className="text-xs text-gray-500 text-center">
              Ваш прогресс и история разговоров будут сохранены
            </p>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
