import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { getAuthHeaders } from '@/lib/session';
import { toast } from '@/hooks/use-toast';
import AddContactModal from './AddContactModal';
import type { AvatarConfig } from '@/components/ui/AstroAvatar';
import IllustratedAvatar from '@/components/ui/IllustratedAvatar';
import { useAvatarSync } from '@/context/AvatarSyncContext';
import ContactProfileSheet from './ContactProfileSheet';

export interface Contact {
  id: number;
  name: string;
  relation?: string | null;
  birthDate: string;
  birthTime?: string | null;
  birthPlace?: string | null;
  birthLat?: number | null;
  birthLng?: number | null;
  avatarConfig?: AvatarConfig | null;
}

interface PeoplePanelProps {
  selectedContactId: number | null;
  onSelect: (id: number | null) => void;
  /** После загрузки списка контактов — для одноразового онбординга в чате. */
  onContactsLoaded?: (count: number) => void;
  /** Подсветка кнопки «Добавить» во втором шаге онбординга. */
  onboardingHighlightAdd?: boolean;
}

export default function PeoplePanel({
  selectedContactId,
  onSelect,
  onContactsLoaded,
  onboardingHighlightAdd = false,
}: PeoplePanelProps) {
  const { avatarConfig } = useAvatarSync();
  const [, setLocation] = useLocation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [openedContact, setOpenedContact] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [contactsFetchDone, setContactsFetchDone] = useState(false);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts', { headers: getAuthHeaders() });
      if (res.ok) {
        const list = (await res.json()) as Contact[];
        setContacts(list);
        onContactsLoaded?.(list.length);
        setContactsFetchDone(true);
        return;
      }
      onContactsLoaded?.(0);
      setContactsFetchDone(true);
      toast({
        title: 'Контакты не подгрузились',
        description: 'Обновите страницу — так мы попробуем загрузить список ещё раз.',
      });
    } catch (err) {
      console.error('fetchContacts failed', err);
      toast({
        title: 'Сеть подвела',
        description: 'Не смогли загрузить контакты. Когда связь вернётся — обновите страницу.',
      });
      onContactsLoaded?.(0);
      setContactsFetchDone(true);
    }
  }, [onContactsLoaded]);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    setDeleting(id);
    try {
      await fetch(`/api/contacts/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      setContacts(prev => prev.filter(c => c.id !== id));
      if (selectedContactId === id) onSelect(null);
    } catch (err) {
      console.error('delete contact failed', err);
      toast({
        title: 'Контакт не удалился',
        description: 'Попробуйте ещё раз через пару секунд.',
      });
    }
    setDeleting(null);
  };

  const getInitials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const getColor = (id: number) => {
    const colors = ['from-violet-500 to-purple-700','from-rose-500 to-pink-700','from-sky-500 to-blue-700','from-emerald-500 to-teal-700','from-amber-500 to-orange-700'];
    return colors[id % colors.length];
  };

  const hasContacts = contacts.length > 0;

  return (
    <>
      <div data-tutorial-id="people-panel" className="flex items-center gap-2 px-3 py-2 overflow-x-auto scrollbar-none bg-background/60 border-b border-border/50">

        {/* «Я» */}
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={() => {
            if (selectedContactId !== null) {
              onSelect(null);
              return;
            }
            setLocation('/profile');
          }}
          className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-sm font-medium shrink-0 transition-all border ${
            selectedContactId === null
              ? 'bg-primary/20 border-primary text-primary shadow-[0_0_10px_rgba(212,175,55,0.25)]'
              : 'bg-card border-border text-muted-foreground hover:border-primary/40'
          }`}
        >
          <div className="w-8 h-8 rounded-full overflow-hidden border border-primary/30 shrink-0">
            <IllustratedAvatar config={avatarConfig} size={32} relaxedCrop />
          </div>
          <span>Я</span>
        </motion.button>

        {/* Контакты */}
        <AnimatePresence initial={false}>
          {contacts.map(contact => (
            <motion.div
              key={contact.id}
              initial={{ opacity: 0, scale: 0.8, x: -10 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: -10 }}
              className="relative group shrink-0"
            >
              <button
                onClick={() => {
                  if (selectedContactId === contact.id) {
                    setOpenedContact(contact);
                    return;
                  }
                  onSelect(contact.id);
                }}
                className={`flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-sm font-medium transition-all border ${
                  selectedContactId === contact.id
                    ? 'bg-primary/20 border-primary text-primary shadow-[0_0_10px_rgba(212,175,55,0.25)]'
                    : 'bg-card border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                <div className={`w-6.5 h-6.5 rounded-full overflow-hidden border border-primary/30 shrink-0 ${
                  contact.avatarConfig ? '' : `bg-gradient-to-br ${getColor(contact.id)}`
                }`}>
                  {contact.avatarConfig ? (
                    <IllustratedAvatar config={contact.avatarConfig} size={26} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[9px] text-white font-bold">
                      {getInitials(contact.name)}
                    </div>
                  )}
                </div>
                <span className="max-w-[90px] truncate">{contact.name}</span>
                {contact.relation && (
                  <span className="text-[10px] text-muted-foreground/60">· {contact.relation}</span>
                )}
              </button>

              <button
                onClick={(e) => handleDelete(e, contact.id)}
                disabled={deleting === contact.id}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-white items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hidden md:flex"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Состояние 1: нет людей — большая кнопка совместимости */}
        {contactsFetchDone && !hasContacts && (
          <motion.button
            type="button"
            data-onboarding-target="add-contact"
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowModal(true)}
            className={`flex flex-1 min-w-[200px] items-center gap-2 rounded-full border border-violet-500/35 bg-gradient-to-r from-violet-950/40 via-card/80 to-fuchsia-950/30 px-3 py-2 text-sm font-medium text-foreground/90 shadow-[0_0_20px_rgba(139,92,246,0.15)] hover:border-violet-400/50 transition-all ${
              onboardingHighlightAdd ? 'ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse' : ''
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-600/80 text-white">
              <Plus className="w-4 h-4" strokeWidth={2.5} />
            </span>
            <span className="flex-1 text-center leading-snug">Совместимость с любым человеком</span>
            <Users className="w-5 h-5 shrink-0 text-violet-400/90" strokeWidth={1.75} />
          </motion.button>
        )}

        {/* Состояние 2: есть люди — компактная «+» */}
        {hasContacts && (
          <motion.button
            type="button"
            data-onboarding-target="add-contact"
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowModal(true)}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border/80 text-muted-foreground hover:border-primary/50 hover:text-primary transition-all ${
              onboardingHighlightAdd ? 'ring-2 ring-primary ring-offset-2 ring-offset-background animate-pulse' : ''
            }`}
            aria-label="Добавить человека"
          >
            <Plus className="w-4 h-4" />
          </motion.button>
        )}
      </div>

      <AddContactModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onAdded={fetchContacts}
      />

      <ContactProfileSheet
        open={Boolean(openedContact)}
        contact={openedContact}
        onClose={() => setOpenedContact(null)}
        onUpdated={(updated) => {
          setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
          setOpenedContact(updated);
        }}
        onDeleted={(id) => {
          setContacts((prev) => prev.filter((c) => c.id !== id));
          if (selectedContactId === id) onSelect(null);
          setOpenedContact(null);
        }}
      />
    </>
  );
}
