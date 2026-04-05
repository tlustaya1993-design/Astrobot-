import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, LogOut, LogIn, BrainCircuit, Sparkles, Trash2, Pencil } from "lucide-react";
import { type AvatarConfig, DEFAULT_AVATAR } from "@/components/ui/AstroAvatar";
import IllustratedAvatar, { AvatarPortraitImage } from "@/components/ui/IllustratedAvatar";
import AvatarEditor from "@/components/ui/AvatarEditor";
import { getAuthHeaders } from "@/lib/session";
import { useAuth } from "@/context/AuthContext";
import { useAvatarSync } from "@/context/AvatarSyncContext";
import AuthModal from "@/components/AuthModal";

interface UserProfile {
  name?: string | null;
  birthDate?: string | null;
  birthPlace?: string | null;
  birthTime?: string | null;
  birthLat?: number | null;
  birthLng?: number | null;
  birthTimeUnknown?: boolean | null;
  gender?: string | null;
  requestsUsed?: number | null;
  requestsBalance?: number | null;
  freeRemaining?: number | null;
  freeLimit?: number | null;
  isUnlimited?: boolean;
  requestsTotalPurchased?: number | null;
}

interface Memory {
  id: number;
  content: string;
  updatedAt: string;
}

function getZodiacSimple(m: number, d: number): string {
  if ((m === 3 && d >= 21) || (m === 4 && d <= 19)) return "Овен ♈";
  if ((m === 4 && d >= 20) || (m === 5 && d <= 20)) return "Телец ♉";
  if ((m === 5 && d >= 21) || (m === 6 && d <= 20)) return "Близнецы ♊";
  if ((m === 6 && d >= 21) || (m === 7 && d <= 22)) return "Рак ♋";
  if ((m === 7 && d >= 23) || (m === 8 && d <= 22)) return "Лев ♌";
  if ((m === 8 && d >= 23) || (m === 9 && d <= 22)) return "Дева ♍";
  if ((m === 9 && d >= 23) || (m === 10 && d <= 22)) return "Весы ♎";
  if ((m === 10 && d >= 23) || (m === 11 && d <= 21)) return "Скорпион ♏";
  if ((m === 11 && d >= 22) || (m === 12 && d <= 21)) return "Стрелец ♐";
  if ((m === 12 && d >= 22) || (m === 1 && d <= 19)) return "Козерог ♑";
  if ((m === 1 && d >= 20) || (m === 2 && d <= 18)) return "Водолей ♒";
  return "Рыбы ♓";
}

function formatBirthDate(s: string): string {
  try {
    const d = new Date(s);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  } catch {
    return s;
  }
}

function toInputDate(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** «HH:mm» для input type=time из произвольной строки времени */
function toInputTime(raw?: string | null): string {
  if (!raw) return "";
  const m = String(raw).match(/(\d{1,2}):(\d{2})/);
  if (!m) return "";
  const h = m[1].padStart(2, "0");
  const min = m[2];
  return `${h}:${min}`;
}

type Section = "view" | "avatar" | "memories" | "edit";

interface Props {
  open: boolean;
  onClose: () => void;
  onChartMetaChanged?: () => void;
}

export default function ProfileSheet({ open, onClose, onChartMetaChanged }: Props) {
  const { isLoggedIn, email, logout } = useAuth();
  const { avatarConfig, setAvatarConfigLocal } = useAvatarSync();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [section, setSection] = useState<Section>("view");
  const [localAvatar, setLocalAvatar] = useState<AvatarConfig>(avatarConfig);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [editName, setEditName] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editBirthTime, setEditBirthTime] = useState("");
  const [editBirthTimeUnknown, setEditBirthTimeUnknown] = useState(false);
  const [editBirthPlace, setEditBirthPlace] = useState("");
  const [editBirthLat, setEditBirthLat] = useState("");
  const [editBirthLng, setEditBirthLng] = useState("");

  useEffect(() => {
    setLocalAvatar(avatarConfig);
  }, [avatarConfig]);

  const applyUserPayload = useCallback(
    (raw: Record<string, unknown>) => {
      const { chartMetaChanged: _c, ...rest } = raw;
      setProfile(rest as UserProfile);
      const ac = raw.avatarConfig;
      if (ac != null && typeof ac === "object") {
        setAvatarConfigLocal({ ...DEFAULT_AVATAR, ...(ac as AvatarConfig) });
      }
    },
    [setAvatarConfigLocal],
  );

  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/users/me", { headers: getAuthHeaders() });
      if (res.ok) applyUserPayload((await res.json()) as Record<string, unknown>);
    } catch {
      /* ignore */
    }
  }, [applyUserPayload]);

  const fetchMemories = useCallback(async () => {
    setMemoriesLoading(true);
    try {
      const res = await fetch("/api/openai/memories", { headers: getAuthHeaders() });
      if (res.ok) setMemories(await res.json());
    } catch {
      /* ignore */
    } finally {
      setMemoriesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void fetchProfile();
      setSection("view");
    }
  }, [open, fetchProfile]);

  useEffect(() => {
    if (section === "memories") void fetchMemories();
  }, [section, fetchMemories]);

  useEffect(() => {
    if (section !== "edit" || !profile) return;
    setEditName(profile.name ?? "");
    setEditBirthDate(toInputDate(profile.birthDate));
    setEditBirthTime(toInputTime(profile.birthTime));
    setEditBirthTimeUnknown(Boolean(profile.birthTimeUnknown));
    setEditBirthPlace(profile.birthPlace ?? "");
    setEditBirthLat(
      profile.birthLat != null && Number.isFinite(profile.birthLat) ? String(profile.birthLat) : "",
    );
    setEditBirthLng(
      profile.birthLng != null && Number.isFinite(profile.birthLng) ? String(profile.birthLng) : "",
    );
    setProfileError(null);
  }, [section, profile]);

  const handleDeleteMemory = async (id: number) => {
    try {
      await fetch(`/api/openai/memories/${id}`, { method: "DELETE", headers: getAuthHeaders() });
      setMemories((m) => m.filter((x) => x.id !== id));
    } catch {
      /* ignore */
    }
  };

  const handleSaveAvatar = async () => {
    setProfileError(null);
    setAvatarSaving(true);
    setAvatarConfigLocal(localAvatar);
    try {
      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ avatarConfig: localAvatar }),
      });
      if (!res.ok) throw new Error("save_failed");
      const raw = (await res.json()) as Record<string, unknown>;
      applyUserPayload(raw);
      setSection("view");
    } catch {
      setProfileError("Не удалось сохранить аватар. Попробуйте ещё раз.");
    } finally {
      setAvatarSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileError(null);
    const latStr = editBirthLat.trim();
    const lngStr = editBirthLng.trim();
    if (latStr !== "" && !Number.isFinite(Number(latStr))) {
      setProfileError("Некорректная широта (ожидается число).");
      setProfileSaving(false);
      return;
    }
    if (lngStr !== "" && !Number.isFinite(Number(lngStr))) {
      setProfileError("Некорректная долгота (ожидается число).");
      setProfileSaving(false);
      return;
    }
    const body: Record<string, unknown> = {
      name: editName.trim() || null,
      birthDate: editBirthDate || null,
      birthTime: editBirthTimeUnknown ? null : editBirthTime || null,
      birthTimeUnknown: editBirthTimeUnknown,
      birthPlace: editBirthPlace.trim() || null,
      birthLat: latStr === "" ? null : Number(latStr),
      birthLng: lngStr === "" ? null : Number(lngStr),
    };
    try {
      const res = await fetch("/api/users/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("save_failed");
      const raw = (await res.json()) as Record<string, unknown> & { chartMetaChanged?: boolean };
      applyUserPayload(raw);
      if (raw.chartMetaChanged) onChartMetaChanged?.();
      setSection("view");
    } catch {
      setProfileError("Не удалось сохранить профиль. Проверьте данные и попробуйте снова.");
    } finally {
      setProfileSaving(false);
    }
  };

  const zodiac = profile?.birthDate
    ? getZodiacSimple(
        new Date(profile.birthDate).getMonth() + 1,
        new Date(profile.birthDate).getDate(),
      )
    : null;

  const backLabel =
    section === "avatar" || section === "memories" || section === "edit" ? "← Назад" : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="fixed bottom-0 inset-x-0 z-50 flex justify-center"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
          >
            <div className="relative w-full max-w-2xl bg-card border-t border-border rounded-t-3xl shadow-2xl overflow-visible">
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-border" />
              </div>

              <div className="flex items-center justify-between px-5 py-3">
                {backLabel ? (
                  <button
                    type="button"
                    onClick={() => setSection("view")}
                    className="text-sm text-muted-foreground hover:text-foreground transition"
                  >
                    {backLabel}
                  </button>
                ) : (
                  <span className="text-base font-semibold font-display">Мой профиль</span>
                )}
                <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-white/5 transition">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              {section === "avatar" && (
                <div className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-2 md:-top-16 z-10">
                  <div className="relative rounded-full border-[4px] border-primary/75 shadow-[0_0_44px_rgba(212,175,55,0.36)] bg-[#08081a] w-[220px] h-[220px] md:w-[286px] md:h-[286px] overflow-hidden">
                    <AvatarPortraitImage
                      config={localAvatar}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 rounded-full ring-1 ring-white/10" />
                  </div>
                </div>
              )}

              {section === "view" && (
                <div className="px-5 pb-8 space-y-5 max-h-[80vh] overflow-y-auto">
                  <div className="flex items-center gap-4">
                    <div className="relative shrink-0">
                      <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-primary/40 shadow-[0_0_16px_rgba(212,175,55,0.2)]">
                        <IllustratedAvatar config={avatarConfig} size={80} />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-lg font-semibold font-display truncate">
                        {profile?.name || "Пользователь"}
                      </p>
                      {zodiac && <p className="text-sm text-primary font-medium">{zodiac}</p>}
                      {profile?.requestsUsed != null && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {profile.requestsUsed} {pluralRequests(profile.requestsUsed)} отправлено
                        </p>
                      )}
                      {profile?.isUnlimited && (
                        <p className="text-xs text-emerald-400 mt-0.5">Безлимитный доступ активен</p>
                      )}
                      {!profile?.isUnlimited && profile?.freeRemaining != null && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Бесплатно: {profile.freeRemaining}/{profile.freeLimit ?? 5}
                        </p>
                      )}
                      {profile?.requestsBalance != null && (
                        <p className="text-xs text-primary/80 mt-0.5">
                          Осталось: {profile.requestsBalance} {pluralRequests(profile.requestsBalance)}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSection("avatar")}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-primary/35 text-primary text-sm font-medium hover:bg-primary/10 transition"
                  >
                    <Sparkles className="w-4 h-4" />
                    Редактировать аватар
                  </button>

                  <button
                    type="button"
                    onClick={() => setSection("edit")}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-foreground text-sm font-medium hover:bg-white/5 transition"
                  >
                    <Pencil className="w-4 h-4" />
                    Редактировать данные профиля
                  </button>

                  {profile?.birthDate && (
                    <InfoRow label="Дата рождения" value={formatBirthDate(profile.birthDate)} />
                  )}
                  {profile?.birthTime && (
                    <InfoRow label="Время рождения" value={profile.birthTime} />
                  )}
                  {profile?.birthPlace && (
                    <InfoRow label="Место рождения" value={profile.birthPlace} />
                  )}

                  {!profile?.birthDate && !profile?.name && (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      Пройди онбординг, чтобы добавить данные
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => setSection("memories")}
                    className="w-full flex items-center gap-3 py-3 px-4 rounded-2xl border border-border/40 hover:border-primary/30 hover:bg-white/5 transition"
                  >
                    <BrainCircuit className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium">Моя память</p>
                      <p className="text-xs text-muted-foreground">Что AstroBot помнит о тебе</p>
                    </div>
                    <span className="text-xs text-muted-foreground">→</span>
                  </button>

                  <div className="pt-1 border-t border-border/40 space-y-2">
                    {isLoggedIn ? (
                      <>
                        {email && <p className="text-xs text-muted-foreground truncate">{email}</p>}
                        <button
                          type="button"
                          onClick={() => {
                            logout();
                            onClose();
                          }}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/10 transition"
                        >
                          <LogOut className="w-4 h-4" />
                          Выйти из аккаунта
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setShowAuthModal(true)}
                          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-primary/30 text-primary text-sm font-medium hover:bg-primary/10 transition"
                        >
                          <LogIn className="w-4 h-4" />
                          Войти / Зарегистрироваться
                        </button>
                        <p className="text-xs text-muted-foreground text-center leading-relaxed">
                          Синхронизирует историю и контекст на всех твоих устройствах
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              <AuthModal open={showAuthModal} onClose={() => setShowAuthModal(false)} initialTab="login" />

              {section === "memories" && (
                <div className="px-5 pb-8 space-y-4 max-h-[75vh] overflow-y-auto">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    AstroBot запоминает важные факты из ваших разговоров, чтобы лучше понимать контекст. Ты
                    можешь удалить любой факт.
                  </p>

                  {memoriesLoading && (
                    <div className="flex justify-center py-8">
                      <div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    </div>
                  )}

                  {!memoriesLoading && memories.length === 0 && (
                    <div className="text-center py-10 space-y-2">
                      <BrainCircuit className="w-10 h-10 text-muted-foreground/30 mx-auto" />
                      <p className="text-sm text-muted-foreground">Пока ничего не запомнено</p>
                      <p className="text-xs text-muted-foreground/60">
                        Память заполнится после нескольких разговоров
                      </p>
                    </div>
                  )}

                  {!memoriesLoading &&
                    memories.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-start gap-3 py-3 px-4 rounded-2xl border border-border/40 bg-white/[0.02] group"
                      >
                        <p className="flex-1 text-sm text-foreground leading-relaxed">{m.content}</p>
                        <button
                          type="button"
                          onClick={() => void handleDeleteMemory(m.id)}
                          className="shrink-0 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-destructive transition-all"
                          title="Удалить"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                </div>
              )}

              {section === "edit" && (
                <div className="px-5 pb-8 space-y-4 max-h-[75vh] overflow-y-auto">
                  {profileError && (
                    <p className="text-sm text-destructive" role="alert">
                      {profileError}
                    </p>
                  )}
                  <label className="block space-y-1.5">
                    <span className="text-xs text-muted-foreground">Имя</span>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full rounded-xl bg-background border border-border px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                      placeholder="Как к тебе обращаться"
                    />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs text-muted-foreground">Дата рождения</span>
                    <input
                      type="date"
                      value={editBirthDate}
                      onChange={(e) => setEditBirthDate(e.target.value)}
                      className="w-full rounded-xl bg-background border border-border px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                    />
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editBirthTimeUnknown}
                      onChange={(e) => setEditBirthTimeUnknown(e.target.checked)}
                      className="rounded border-border"
                    />
                    <span className="text-sm text-foreground">Время рождения неизвестно</span>
                  </label>
                  {!editBirthTimeUnknown && (
                    <label className="block space-y-1.5">
                      <span className="text-xs text-muted-foreground">Время рождения</span>
                      <input
                        type="time"
                        value={editBirthTime}
                        onChange={(e) => setEditBirthTime(e.target.value)}
                        className="w-full rounded-xl bg-background border border-border px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                      />
                    </label>
                  )}
                  <label className="block space-y-1.5">
                    <span className="text-xs text-muted-foreground">Место рождения (текст)</span>
                    <input
                      value={editBirthPlace}
                      onChange={(e) => setEditBirthPlace(e.target.value)}
                      className="w-full rounded-xl bg-background border border-border px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                      placeholder="Город, страна"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block space-y-1.5">
                      <span className="text-xs text-muted-foreground">Широта</span>
                      <input
                        value={editBirthLat}
                        onChange={(e) => setEditBirthLat(e.target.value)}
                        className="w-full rounded-xl bg-background border border-border px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                        placeholder="напр. 55.75"
                        inputMode="decimal"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-xs text-muted-foreground">Долгота</span>
                      <input
                        value={editBirthLng}
                        onChange={(e) => setEditBirthLng(e.target.value)}
                        className="w-full rounded-xl bg-background border border-border px-3 py-2.5 text-sm outline-none focus:border-primary/50"
                        placeholder="напр. 37.62"
                        inputMode="decimal"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={profileSaving}
                    onClick={() => void handleSaveProfile()}
                    className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition"
                  >
                    {profileSaving ? "Сохранение…" : "Сохранить"}
                  </button>
                </div>
              )}

              {section === "avatar" && (
                <div className="px-5 pb-8 pt-[14rem] md:pt-[13.25rem] space-y-5 max-h-[75vh] overflow-y-auto overflow-x-visible">
                  {profileError && (
                    <p className="text-sm text-destructive" role="alert">
                      {profileError}
                    </p>
                  )}
                  <AvatarEditor
                    avatarConfig={localAvatar}
                    onChange={setLocalAvatar}
                    onSave={() => void handleSaveAvatar()}
                    saving={avatarSaving}
                    saveLabel="Сохранить аватар"
                  />
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function pluralRequests(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "запросов";
  if (mod10 === 1) return "запрос";
  if (mod10 >= 2 && mod10 <= 4) return "запроса";
  return "запросов";
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-3 py-2.5 border-b border-border/40">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm text-foreground text-right">{value}</span>
    </div>
  );
}
