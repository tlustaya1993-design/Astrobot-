import React, { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getAuthHeaders } from '@/lib/session';
import AddContactModal from './AddContactModal';
import ProfileSheet from '@/components/profile/ProfileSheet';
import ContactProfileSheet from './ContactProfileSheet';
import { loadAvatar, type AvatarConfig, DEFAULT_AVATAR } from '@/components/ui/AstroAvatar';
import IllustratedAvatar from '@/components/ui/IllustratedAvatar';

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
}

export default function PeoplePanel({ selectedContactId, onSelect }: PeoplePanelProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showContactProfile, setShowContactProfile] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [activeContact, setActiveContact] = useState<Contact | null>(null);
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

  const handleOpenContactProfile = (contact: Contact) => {
    setActiveContact(contact);
    setShowContactProfile(true);
  };

  const handleContactUpdated = (updatedContact: Contact) => {
    setContacts(prev => prev.map(c => (c.id === updatedContact.id ? updatedContact : c)));
    setActiveContact(updatedContact);
  };

  const handleContactDeleted = (deletedContactId: number) => {
    setContacts(prev => prev.filter(c => c.id !== deletedContactId));
    if (selectedContactId === deletedContactId) onSelect(null);
    if (activeContact?.id === deletedContactId) {
      setActiveContact(null);
      setShowContactProfile(false);
    }
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
            <IllustratedAvatar config={avatarConfig} size={28} />
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
              className="shrink-0"
            >
              <button
                onClick={() => handleOpenContactProfile(contact)}
                className={`flex items-center gap-1.5 pl-1.5 pr-3 py-1.5 rounded-full text-sm font-medium transition-all border ${
                  selectedContactId === contact.id
                    ? 'bg-primary/20 border-primary text-primary shadow-[0_0_10px_rgba(212,175,55,0.25)]'
                    : 'bg-card border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                <div className="w-5 h-5 rounded-full overflow-hidden border border-white/10 shrink-0">
                  {contact.avatarConfig ? (
                    <IllustratedAvatar config={contact.avatarConfig} size={20} />
                  ) : (
                    <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${getColor(contact.id)} flex items-center justify-center text-[9px] text-white font-bold shrink-0`}>
                      {getInitials(contact.name)}
                    </div>
                  )}
                </div>
                <span className="max-w-[90px] truncate">{contact.name}</span>
                {contact.relation && (
                  <span className="text-[10px] text-muted-foreground/60">· {contact.relation}</span>
                )}
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

      <ContactProfileSheet
        open={showContactProfile}
        onClose={() => {
          setShowContactProfile(false);
          setActiveContact(null);
        }}
        contact={activeContact}
        onUpdated={handleContactUpdated}
        onDeleted={handleContactDeleted}
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
