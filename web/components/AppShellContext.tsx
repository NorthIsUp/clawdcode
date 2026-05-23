import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface AppShellSlot {
  title: ReactNode;
  actions: ReactNode | null;
}

interface AppShellContextValue {
  slot: AppShellSlot | null;
  setSlot: (slot: AppShellSlot | null) => void;
}

const AppShellContext = createContext<AppShellContextValue>({
  slot: null,
  setSlot: () => {},
});

export function AppShellProvider({ children }: { children: ReactNode }) {
  const [slot, setSlotState] = useState<AppShellSlot | null>(null);
  const setSlot = useCallback((next: AppShellSlot | null) => {
    setSlotState(next);
  }, []);
  const value = useMemo(() => ({ slot, setSlot }), [slot, setSlot]);
  return (
    <AppShellContext.Provider value={value}>
      {children}
    </AppShellContext.Provider>
  );
}

/**
 * Used by AppShell to read the active section's title + actions.
 */
export function useAppShellSlot(): AppShellSlot | null {
  return useContext(AppShellContext).slot;
}

/**
 * Used by sections to register their title + actions in the topbar.
 * Pass `null` for `actions` when the section has no per-section actions.
 *
 * Call this unconditionally — it uses `useEffect` internally and is safe
 * to call on every render (deps prevent spurious updates).
 */
export { AppShellContext };
