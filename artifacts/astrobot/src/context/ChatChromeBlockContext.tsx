import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Ctx = {
  acquire: () => void;
  release: () => void;
  blocked: boolean;
};

const ChatChromeBlockContext = createContext<Ctx | null>(null);

export function ChatChromeBlockProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);
  const acquire = useCallback(() => {
    setCount((c) => c + 1);
  }, []);
  const release = useCallback(() => {
    setCount((c) => Math.max(0, c - 1));
  }, []);
  const value = useMemo(
    () => ({
      acquire,
      release,
      blocked: count > 0,
    }),
    [acquire, release, count],
  );
  return (
    <ChatChromeBlockContext.Provider value={value}>{children}</ChatChromeBlockContext.Provider>
  );
}

export function useChatChromeBlocked(): boolean {
  return useContext(ChatChromeBlockContext)?.blocked ?? false;
}

/** Пока overlay открыт — скрываем нижнюю строку ввода в чате. */
export function useRegisterChatChromeOverlay(active: boolean) {
  const ctx = useContext(ChatChromeBlockContext);
  useEffect(() => {
    if (!ctx || !active) return;
    ctx.acquire();
    return () => ctx.release();
  }, [active, ctx]);
}
