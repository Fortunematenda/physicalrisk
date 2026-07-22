'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Building2,
  ClipboardList,
  FileText,
  LogOut,
  Mail,
  Menu,
  Search,
} from 'lucide-react';
import {
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { userInitials } from '@/components/layout/app-sidebar';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { apiFetch } from '@/lib/api';
import {
  ensureSsoUser,
  getStoredUser,
  getUserDisplayName,
  roleDisplayLabel,
} from '@/lib/auth-user';
import { cn } from '@/lib/utils';

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  /** Optional page-specific controls (filters, export) — rendered before utilities, never replaces them */
  actions?: React.ReactNode;
  searchPlaceholder?: string;
  onSearch?: (value: string) => void;
  searchValue?: string;
  hideSearch?: boolean;
  onMenuClick?: () => void;
  onLogout?: () => void;
  notificationCount?: number;
  mailCount?: number;
  className?: string;
};

type Suggestion = {
  id: string;
  href: string;
  title: string;
  subtitle?: string;
  kind: 'assessment' | 'organisation' | 'report';
};

type AssessmentHit = {
  id: string;
  reference?: string;
  title?: string;
  status?: string;
  organisation?: { id?: string; name?: string } | null;
};

type OrganisationHit = {
  id: string;
  name?: string;
  industry?: string | null;
};

type ReportHit = {
  id: string;
  reference?: string;
  title?: string;
  assessment?: {
    id?: string;
    reference?: string;
    organisation?: { name?: string } | null;
  } | null;
};

const KIND_META = {
  assessment: { label: 'Assessments', icon: ClipboardList },
  organisation: { label: 'Organisations', icon: Building2 },
  report: { label: 'Reports', icon: FileText },
} as const;

type SearchCache = {
  at: number;
  assessments: AssessmentHit[];
  organisations: OrganisationHit[];
  reports: ReportHit[];
};

function matchesNeedle(haystack: Array<string | null | undefined>, needle: string) {
  return haystack
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(needle);
}

export function AppHeader({
  title,
  subtitle,
  actions,
  searchPlaceholder = 'Search…',
  onSearch,
  searchValue = '',
  hideSearch = false,
  onMenuClick,
  onLogout,
  notificationCount = 0,
  mailCount = 0,
  className,
}: AppHeaderProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [roleLabel, setRoleLabel] = useState('');
  const [localSearch, setLocalSearch] = useState(searchValue);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const searchWrapRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cacheRef = useRef<SearchCache | null>(null);
  const requestIdRef = useRef(0);

  const searchControlled = typeof onSearch === 'function';
  const query = searchControlled ? searchValue : localSearch;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const user = (await ensureSsoUser()) || getStoredUser();
      if (cancelled) return;
      setDisplayName(getUserDisplayName(user));
      setRoleLabel(user ? roleDisplayLabel(user.role) : 'User');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setLocalSearch(searchValue);
  }, [searchValue]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (
        searchWrapRef.current &&
        !searchWrapRef.current.contains(event.target as Node)
      ) {
        setSearchOpen(false);
        setActiveIndex(-1);
      }
    }

    function handleShortcut(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') {
        setSearchOpen(false);
        setActiveIndex(-1);
        if (document.activeElement === searchInputRef.current) {
          searchInputRef.current?.blur();
        }
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleShortcut);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleShortcut);
    };
  }, []);

  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) {
      setSuggestions([]);
      setSearchLoading(false);
      setActiveIndex(-1);
      return;
    }

    setSearchLoading(true);
    const requestId = ++requestIdRef.current;
    const timer = window.setTimeout(async () => {
      try {
        let cache = cacheRef.current;
        if (!cache || Date.now() - cache.at > 30_000) {
          const [assessments, organisations, reportsRaw] = await Promise.all([
            apiFetch<AssessmentHit[]>('/assessments').catch(() => [] as AssessmentHit[]),
            apiFetch<OrganisationHit[]>('/organisations').catch(() => [] as OrganisationHit[]),
            apiFetch<ReportHit[] | { items?: ReportHit[] }>('/reports').catch(
              () => [] as ReportHit[],
            ),
          ]);
          const reports = Array.isArray(reportsRaw)
            ? reportsRaw
            : Array.isArray(reportsRaw?.items)
              ? reportsRaw.items
              : [];
          cache = {
            at: Date.now(),
            assessments,
            organisations,
            reports,
          };
          cacheRef.current = cache;
        }

        if (requestId !== requestIdRef.current) return;

        const needle = clean.toLowerCase();
        const next: Suggestion[] = [
          ...cache.assessments
            .filter((item) =>
              matchesNeedle(
                [
                  item.reference,
                  item.title,
                  item.status,
                  item.organisation?.name,
                ],
                needle,
              ),
            )
            .slice(0, 6)
            .map((item) => ({
              id: `assessment-${item.id}`,
              href: `/assessments/${item.id}`,
              title: item.title || item.reference || 'Assessment',
              subtitle: [item.reference, item.organisation?.name, item.status]
                .filter(Boolean)
                .join(' · '),
              kind: 'assessment' as const,
            })),
          ...cache.organisations
            .filter((item) =>
              matchesNeedle([item.name, item.industry], needle),
            )
            .slice(0, 4)
            .map((item) => ({
              id: `organisation-${item.id}`,
              href: `/organisations/${item.id}`,
              title: item.name || 'Organisation',
              subtitle: item.industry || 'Organisation',
              kind: 'organisation' as const,
            })),
          ...cache.reports
            .filter((item) =>
              matchesNeedle(
                [
                  item.reference,
                  item.title,
                  item.assessment?.reference,
                  item.assessment?.organisation?.name,
                ],
                needle,
              ),
            )
            .slice(0, 4)
            .map((item) => ({
              id: `report-${item.id}`,
              href: `/reports/${item.id}`,
              title: item.reference || item.title || 'Report',
              subtitle: [
                item.assessment?.reference,
                item.assessment?.organisation?.name,
              ]
                .filter(Boolean)
                .join(' · '),
              kind: 'report' as const,
            })),
        ];

        setSuggestions(next);
        setActiveIndex(next.length ? 0 : -1);
        setSearchOpen(true);
      } catch {
        if (requestId === requestIdRef.current) {
          setSuggestions([]);
          setActiveIndex(-1);
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setSearchLoading(false);
        }
      }
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query]);

  function setQuery(value: string) {
    if (searchControlled) onSearch?.(value);
    else setLocalSearch(value);
  }

  function goToSuggestion(suggestion: Suggestion) {
    setSearchOpen(false);
    setActiveIndex(-1);
    setQuery('');
    setSuggestions([]);
    router.push(suggestion.href);
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!suggestions.length) return;
      setSearchOpen(true);
      setActiveIndex((current) =>
        current < suggestions.length - 1 ? current + 1 : 0,
      );
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!suggestions.length) return;
      setSearchOpen(true);
      setActiveIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === 'Enter') {
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        event.preventDefault();
        goToSuggestion(suggestions[activeIndex]);
      } else if (suggestions[0]) {
        event.preventDefault();
        goToSuggestion(suggestions[0]);
      }
      return;
    }

    if (event.key === 'Escape') {
      setSearchOpen(false);
      setActiveIndex(-1);
    }
  }

  const showDropdown = searchOpen && query.trim().length >= 2;

  const grouped = useMemo(() => {
    return (['assessment', 'organisation', 'report'] as const)
      .map((kind) => ({
        kind,
        items: suggestions.filter((item) => item.kind === kind),
      }))
      .filter((group) => group.items.length > 0);
  }, [suggestions]);

  return (
    <header
      className={cn(
        'sticky top-0 z-30 border-b border-moss-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80',
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 md:hidden"
          aria-label="Open navigation menu"
          onClick={onMenuClick}
        >
          <Menu className="size-5" />
        </Button>

        <div className="min-w-0 flex-1 basis-[12rem]">
          <h1 className="truncate text-[1.35rem] font-bold leading-tight text-moss-text sm:text-[1.75rem]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 truncate text-sm font-normal text-moss-muted">{subtitle}</p>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
          {!hideSearch && (
            <div
              ref={searchWrapRef}
              className="relative min-w-0 flex-1 sm:w-64 sm:flex-none lg:w-72"
            >
              <label className="relative block">
                <span className="sr-only">{searchPlaceholder}</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-moss-muted" />
                <Input
                  ref={searchInputRef}
                  type="search"
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(event) => {
                    const value = event.target.value;
                    setQuery(value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => {
                    if (query.trim().length >= 2) setSearchOpen(true);
                  }}
                  onKeyDown={handleSearchKeyDown}
                  className="h-10 pl-9"
                  aria-autocomplete="list"
                  aria-expanded={showDropdown}
                  aria-controls="moss-header-search-suggestions"
                  autoComplete="off"
                />
              </label>

              {showDropdown && (
                <div
                  id="moss-header-search-suggestions"
                  className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[min(420px,calc(100vh-96px))] min-w-[min(100%,22rem)] overflow-auto rounded-lg border border-moss-border bg-white shadow-lg"
                  role="listbox"
                  aria-label="Search suggestions"
                >
                  {searchLoading && suggestions.length === 0 ? (
                    <div className="px-3.5 py-3.5 text-sm text-moss-muted">
                      Searching…
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="px-3.5 py-3.5 text-sm text-moss-muted">
                      No matches for “{query.trim()}”
                    </div>
                  ) : (
                    grouped.map((group) => {
                      const Meta = KIND_META[group.kind];
                      return (
                        <div
                          key={group.kind}
                          className="border-b border-moss-border last:border-b-0"
                        >
                          <div className="flex items-center gap-1.5 px-3.5 pb-1.5 pt-2.5 text-[11px] font-bold uppercase tracking-wide text-moss-muted">
                            <Meta.icon className="size-3.5" aria-hidden="true" />
                            {Meta.label}
                          </div>
                          {group.items.map((item) => {
                            const index = suggestions.findIndex(
                              (suggestion) => suggestion.id === item.id,
                            );
                            const active = index === activeIndex;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                role="option"
                                aria-selected={active}
                                className={cn(
                                  'flex w-full flex-col items-start gap-0.5 px-3.5 py-2 text-left',
                                  active ? 'bg-moss-page' : 'bg-transparent hover:bg-moss-page',
                                )}
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => goToSuggestion(item)}
                              >
                                <span className="text-sm font-semibold text-moss-text">
                                  {item.title}
                                </span>
                                {item.subtitle ? (
                                  <span className="text-xs text-moss-muted">
                                    {item.subtitle}
                                  </span>
                                ) : null}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          )}

          {actions}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative shrink-0 text-moss-muted hover:text-moss-text"
            aria-label="Notifications"
            title="Notifications"
            asChild
          >
            <Link href="/assessments/assigned">
              <Bell className="size-5" />
              {notificationCount > 0 && (
                <Badge
                  variant="danger"
                  className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full p-0 text-[10px]"
                >
                  {notificationCount > 99 ? '99+' : notificationCount}
                </Badge>
              )}
            </Link>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="relative shrink-0 text-moss-muted hover:text-moss-text"
            aria-label="Email logs"
            title="Email logs"
            asChild
          >
            <Link href="/admin/emails">
              <Mail className="size-5" />
              {mailCount > 0 && (
                <Badge
                  variant="danger"
                  className="absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full p-0 text-[10px]"
                >
                  {mailCount > 99 ? '99+' : mailCount}
                </Badge>
              )}
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-moss-border bg-moss-page text-xs font-semibold text-moss-red outline-none ring-offset-white focus-visible:ring-2 focus-visible:ring-moss-red"
                aria-label="Account menu"
              >
                <Avatar className="size-9">
                  <AvatarFallback className="bg-moss-red/10 text-xs font-semibold text-moss-red">
                    {userInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="min-w-0">
                <p className="truncate font-semibold text-moss-text">{displayName}</p>
                <p className="truncate text-xs font-normal text-moss-muted">{roleLabel}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">Settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-moss-danger focus:text-moss-danger"
                onClick={onLogout}
              >
                <LogOut className="size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
