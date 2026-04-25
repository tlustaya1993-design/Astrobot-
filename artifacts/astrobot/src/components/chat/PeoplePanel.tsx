import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
  /** Показать метку режима при выбранном контакте: база или расширение. */
  contactTier?: 'base' | 'extended' | null;
}

export default function PeoplePanel({ selectedContactId, onSelect, contactTier = null }: PeoplePanelProps) {
  const { avatarConfig } = useAvatarSync();
  const [, setLocation] = useLocation();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [openedContact, setOpenedContact] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts', { headers: getAuthHeaders() });
      if (res.ok) {
        setContacts(await res.json());
        return;
      }
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
    }
  }, []);

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

  return (
    <>
      <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none bg-background/60 border-b border-border/50">

        {/* "Я" chip — shows avatar, opens profile */}
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={() => {
            // When in synastry, first return to "self" chat context.
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

        {/* Contact chips */}
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

              {/* Delete button on hover */}
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

        {/* Add button */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm text-muted-foreground border border-dashed border-border hover:border-primary/40 hover:text-primary transition-all shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Добавить</span>
        </motion.button>

        {/* Synastry indicator */}
        {selectedContactId !== null && contactTier && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="shrink-0 ml-auto text-[11px] text-primary/70 font-medium whitespace-nowrap"
          >
            {contactTier === 'extended' ? 'Расширенный разбор' : 'Базовый разбор'}
          </motion.div>
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
