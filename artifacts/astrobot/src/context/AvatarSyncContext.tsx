import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  DEFAULT_AVATAR,
  loadAvatar,
  saveAvatar,
  type AvatarConfig,
} from "@/components/ui/AstroAvatar";
import { getAuthHeaders } from "@/lib/session";
import { useAuth } from "@/context/AuthContext";

type AvatarSyncContextValue = {
  avatarConfig: AvatarConfig;
  setAvatarConfigLocal: (cfg: AvatarConfig) => void;
  refreshUserAvatar: () => Promise<void>;
};

const AvatarSyncContext = createContext<AvatarSyncContextValue | null>(null);

export function AvatarSyncProvider({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth();
  const [avatarConfig, setState] = useState<AvatarConfig>(() => loadAvatar());

  const setAvatarConfigLocal = useCallback((cfg: AvatarConfig) => {
    setState(cfg);
    saveAvatar(cfg);
  }, []);

  const refreshUserAvatar = useCallback(async () => {
    try {
      const res = await fetch("/api/users/me", { headers: getAuthHeaders() });
      if (!res.ok) return;
      const u = (await res.json()) as { avatarConfig?: AvatarConfig | null };
      if (u.avatarConfig != null && typeof u.avatarConfig === "object") {
        const next = { ...DEFAULT_AVATAR, ...u.avatarConfig };
        setState(next);
        saveAvatar(next);
      }
    } catch {
      /* keep local */
    }
  }, []);

  useEffect(() => {
    void refreshUserAvatar();
  }, [isLoggedIn, refreshUserAvatar]);

  const value: AvatarSyncContextValue = {
    avatarConfig,
    setAvatarConfigLocal,
    refreshUserAvatar,
  };

  return (
    <AvatarSyncContext.Provider value={value}>{children}</AvatarSyncContext.Provider>
  );
}

export function useAvatarSync(): AvatarSyncContextValue {
  const ctx = useContext(AvatarSyncContext);
  if (!ctx) {
    throw new Error("useAvatarSync must be used within AvatarSyncProvider");
  }
  return ctx;
}
