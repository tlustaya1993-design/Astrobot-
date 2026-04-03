import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAuthHeaders } from '@/lib/session';
import AddContactModal from './AddContactModal';
import ProfileSheet from '@/components/profile/ProfileSheet';
import AstroAvatar, { loadAvatar, type AvatarConfig, DEFAULT_AVATAR } from '@/components/ui/AstroAvatar';

export interface Contact {
  id: number;
  name: string;
  relation?: string | null;
  birthDate: string;
  birthTime?: string | null;
  birthPlace?: string | null;
  birthLat?: number | null;
  birthLng?: number | null;
}

interface PeoplePanelProps {
  selectedContactId: number | null;
  onSelect: (id: number | null) => void;
}

export default function PeoplePanel({ selectedContactId, onSelect }: PeoplePanelProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [avatarConfig, setAvatarConfig] = useState<AvatarConfig>(DEFAULT_AVATAR);

  useEffect(() => {
    setAvatarConfig(loadAvatar());
  }, []);

  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts', { headers: getAuthHeaders() });
      if (res.ok) setContacts(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchContacts(); }, [fetchContacts]);

  const handleOpenEdit = (e: React.MouseEvent, contact: Contact) => {
    e.stopPropagation();
    setEditingContact(contact);
    setShowEditModal(true);
  };

  const handleDeleted = () => {
    if (!editingContact) return;
    setContacts(prev => prev.filter(c => c.id !== editingContact.id));
    if (selectedContactId === editingContact.id) onSelect(null);
    setShowEditModal(false);
    setEditingContact(null);
  };

  const getInitials = (name: string) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const getColor = (id: number) => {
    const colors = ['from-violet-500 to-purple-700','from-rose-500 to-pink-700','from-sky-500 to-blue-700','from-emerald-500 to-teal-700','from-amber-500 to-orange-700'];
    return colors[id % colors.length];
  };

  return (
    <>
      <div className="flex items-center gap-2 px-4 py-2.5 overflow-x-auto scrollbar-none bg-background/60 border-b border-border/50">

        {/* "Я" chip — shows avatar, opens profile */}
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={() => setShowProfile(true)}
          className={`flex items-center gap-1.5 pl-1 pr-3 py-1 rounded-full text-sm font-medium shrink-0 transition-all border ${
            selectedContactId === null
              ? 'bg-primary/20 border-primary text-primary shadow-[0_0_10px_rgba(212,175,55,0.25)]'
              : 'bg-card border-border text-muted-foreground hover:border-primary/40'
          }`}
        >
          <div className="w-7 h-7 rounded-full overflow-hidden border border-primary/30 shrink-0">
            <AstroAvatar config={avatarConfig} size={28} />
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
                onClick={() => onSelect(selectedContactId === contact.id ? null : contact.id)}
                className={`flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                  selectedContactId === contact.id
                    ? 'bg-primary/20 border-primary text-primary shadow-[0_0_10px_rgba(212,175,55,0.25)]'
                    : 'bg-card border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${getColor(contact.id)} flex items-center justify-center text-[9px] text-white font-bold shrink-0`}>
                  {getInitials(contact.name)}
                </div>
                <span className="max-w-[90px] truncate">{contact.name}</span>
                {contact.relation && (
                  <span className="text-[10px] text-muted-foreground/60">· {contact.relation}</span>
                )}
              </button>

              <button
                onClick={(e) => handleOpenEdit(e, contact)}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-card border border-border text-muted-foreground flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                aria-label={`Редактировать ${contact.name}`}
                title="Редактировать"
              >
                <Pencil className="w-3 h-3" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Add button */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-muted-foreground border border-dashed border-border hover:border-primary/40 hover:text-primary transition-all shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Добавить</span>
        </motion.button>

        {/* Synastry indicator */}
        {selectedContactId !== null && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="shrink-0 ml-auto text-[11px] text-primary/70 font-medium whitespace-nowrap"
          >
            ⚯ режим синастрии
          </motion.div>
        )}
      </div>

      <AddContactModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onAdded={fetchContacts}
      />

      <AddContactModal
        open={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingContact(null);
        }}
        onAdded={fetchContacts}
        mode="edit"
        initialContact={editingContact}
        onDeleted={handleDeleted}
      />

      <ProfileSheet
        open={showProfile}
        onClose={() => setShowProfile(false)}
        avatarConfig={avatarConfig}
        onAvatarChange={(cfg) => setAvatarConfig(cfg)}
      />
    </>
  );
}
