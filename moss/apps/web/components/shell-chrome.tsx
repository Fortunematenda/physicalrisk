'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ShellChromeState = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Optional left-side header content (e.g. breadcrumb) replacing the page title. */
  headerLeading?: ReactNode;
  searchPlaceholder?: string;
  hideSearch?: boolean;
  /** When true, page title/subtitle are omitted from the top nav (render them in page content instead). */
  hideTitle?: boolean;
  onSearch?: (value: string) => void;
  searchValue?: string;
  notificationCount?: number;
  mailCount?: number;
};

type ShellChromeContextValue = {
  chrome: ShellChromeState;
  setChrome: (patch: Partial<ShellChromeState> & { title: string }) => void;
};

const ShellChromeContext = createContext<ShellChromeContextValue | null>(null);

const DEFAULT_CHROME: ShellChromeState = {
  title: 'Physical Risk',
  subtitle: undefined,
  hideSearch: false,
  hideTitle: false,
  searchPlaceholder: 'Search…',
};

export function ShellChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChromeState] = useState<ShellChromeState>(DEFAULT_CHROME);

  const setChrome = useCallback((patch: Partial<ShellChromeState> & { title: string }) => {
    setChromeState((prev) => ({
      ...prev,
      actions: undefined,
      headerLeading: undefined,
      onSearch: undefined,
      searchValue: undefined,
      notificationCount: undefined,
      mailCount: undefined,
      hideSearch: false,
      hideTitle: false,
      searchPlaceholder: 'Search…',
      subtitle: undefined,
      ...patch,
    }));
  }, []);

  const value = useMemo(() => ({ chrome, setChrome }), [chrome, setChrome]);

  return (
    <ShellChromeContext.Provider value={value}>{children}</ShellChromeContext.Provider>
  );
}

/** Present when a persistent portal shell owns AppShell. */
export function useShellChrome(): ShellChromeContextValue | null {
  return useContext(ShellChromeContext);
}
