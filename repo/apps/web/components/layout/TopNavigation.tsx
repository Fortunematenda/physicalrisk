"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  ChevronDown,
  CircleHelp,
  FileText,
  FolderOpen,
  LogOut,
  Search,
  Settings,
  Upload,
  User,
} from "lucide-react";
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { api } from "@/lib/api";
import styles from "./TopNavigation.module.css";

export interface TopNavigationProps {
  organisationName?: string;
  userName?: string;
  userEmail?: string;
  avatarUrl?: string;
  unreadNotifications?: number;
  onSearch?: (query: string) => void;
  onNotificationsClick?: () => void;
  onHelpClick?: () => void;
  onLogout?: () => void;
}

type Suggestion = {
  id: string;
  href: string;
  title: string;
  subtitle?: string;
  kind: "document" | "project" | "import";
};

type DocumentHit = {
  id: string;
  code?: string;
  title?: string;
  documentType?: string;
  project?: { code?: string; name?: string } | null;
};

type ProjectHit = {
  id: string;
  code?: string;
  name?: string;
};

type ImportHit = {
  id: string;
  fileName?: string;
  status?: string;
  project?: { code?: string; name?: string } | null;
};

const KIND_META = {
  document: { label: "Documents", icon: FileText },
  project: { label: "Projects", icon: FolderOpen },
  import: { label: "Imports", icon: Upload },
} as const;

export default function TopNavigation({
  organisationName = "Physical Risk Consultancy",
  userName = "Administrator",
  userEmail = "admin@physicalrisk.com",
  avatarUrl,
  unreadNotifications = 0,
  onNotificationsClick,
  onHelpClick,
  onLogout,
}: TopNavigationProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [profileOpen, setProfileOpen] = useState(false);
  const [organisationOpen, setOrganisationOpen] = useState(false);
  const [shortcutLabel, setShortcutLabel] = useState("Ctrl K");

  const searchRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const organisationMenuRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  const initials = useMemo(() => {
    return userName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word.charAt(0).toUpperCase())
      .join("");
  }, [userName]);

  useEffect(() => {
    const isMac =
      typeof navigator !== "undefined" &&
      /Mac|iPhone|iPad|iPod/i.test(navigator.platform);

    setShortcutLabel(isMac ? "⌘ K" : "Ctrl K");

    function handleKeyboardShortcut(event: globalThis.KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        setSearchOpen(true);
      }

      if (event.key === "Escape") {
        setProfileOpen(false);
        setOrganisationOpen(false);
        setSearchOpen(false);
        setActiveIndex(-1);

        if (document.activeElement === searchRef.current) {
          searchRef.current?.blur();
        }
      }
    }

    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as Node;

      if (
        searchWrapRef.current &&
        !searchWrapRef.current.contains(target)
      ) {
        setSearchOpen(false);
        setActiveIndex(-1);
      }

      if (
        profileMenuRef.current &&
        !profileMenuRef.current.contains(target)
      ) {
        setProfileOpen(false);
      }

      if (
        organisationMenuRef.current &&
        !organisationMenuRef.current.contains(target)
      ) {
        setOrganisationOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyboardShortcut);
    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("keydown", handleKeyboardShortcut);
      document.removeEventListener("mousedown", handleOutsideClick);
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
      const needle = clean.toLowerCase();
      try {
        const [docs, projects, imports] = await Promise.all([
          api<DocumentHit[]>(`/documents?search=${encodeURIComponent(clean)}`).catch(
            () => [] as DocumentHit[],
          ),
          api<ProjectHit[]>("/projects").catch(() => [] as ProjectHit[]),
          api<ImportHit[]>("/imports").catch(() => [] as ImportHit[]),
        ]);

        if (requestId !== requestIdRef.current) return;

        const next: Suggestion[] = [
          ...docs.slice(0, 6).map((doc) => ({
            id: `doc-${doc.id}`,
            href: `/documents/${doc.id}`,
            title: doc.title || doc.code || "Untitled document",
            subtitle: [doc.code, doc.documentType, doc.project?.code]
              .filter(Boolean)
              .join(" · "),
            kind: "document" as const,
          })),
          ...projects
            .filter((project) => {
              const haystack = [project.code, project.name]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
              return haystack.includes(needle);
            })
            .slice(0, 4)
            .map((project) => ({
              id: `project-${project.id}`,
              href: `/configuration/projects/${project.id}`,
              title: `${project.code ?? ""} — ${project.name ?? ""}`.replace(
                /^ — | — $/g,
                "",
              ),
              subtitle: "Project",
              kind: "project" as const,
            })),
          ...imports
            .filter((job) => {
              const haystack = [
                job.fileName,
                job.status,
                job.project?.code,
                job.project?.name,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
              return haystack.includes(needle);
            })
            .slice(0, 4)
            .map((job) => ({
              id: `import-${job.id}`,
              href: `/imports/${job.id}`,
              title: job.fileName || job.id,
              subtitle: [job.status, job.project?.code].filter(Boolean).join(" · "),
              kind: "import" as const,
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

  function goToSuggestion(suggestion: Suggestion) {
    setSearchOpen(false);
    setActiveIndex(-1);
    setQuery("");
    setSuggestions([]);
    router.push(suggestion.href);
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      goToSuggestion(suggestions[activeIndex]);
      return;
    }
    if (suggestions[0]) {
      goToSuggestion(suggestions[0]);
    }
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!searchOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      if (suggestions.length) setSearchOpen(true);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!suggestions.length) return;
      setActiveIndex((current) =>
        current < suggestions.length - 1 ? current + 1 : 0,
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!suggestions.length) return;
      setActiveIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      );
      return;
    }

    if (event.key === "Escape") {
      setSearchOpen(false);
      setActiveIndex(-1);
    }
  }

  function handleLogout() {
    setProfileOpen(false);

    if (onLogout) {
      onLogout();
      return;
    }

    window.location.href = "/logout";
  }

  const showDropdown =
    searchOpen && query.trim().length >= 2;

  const grouped = useMemo(() => {
    return (["document", "project", "import"] as const)
      .map((kind) => ({
        kind,
        items: suggestions.filter((item) => item.kind === kind),
      }))
      .filter((group) => group.items.length > 0);
  }, [suggestions]);

  return (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <Link
          href="/"
          className={styles.brand}
          aria-label="Go to dashboard"
        >
          <img
            src="/physical_risk_logo_main.png"
            alt="Physical Risk"
            className={styles.brandLogo}
          />
          <span className={styles.brandSubtitle}>Repository Gateway</span>
        </Link>

        <div ref={searchWrapRef} className={styles.searchWrap}>
          <form
            className={styles.searchForm}
            onSubmit={handleSearch}
            role="search"
          >
            <Search
              className={styles.searchIcon}
              size={17}
              aria-hidden="true"
            />

            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
                setProfileOpen(false);
                setOrganisationOpen(false);
              }}
              onFocus={() => {
                if (query.trim().length >= 2) setSearchOpen(true);
              }}
              onKeyDown={handleSearchKeyDown}
              className={styles.searchInput}
              placeholder="Search documents, metadata, workflows..."
              aria-label="Search repository"
              aria-autocomplete="list"
              aria-expanded={showDropdown}
              aria-controls="top-nav-search-suggestions"
              autoComplete="off"
            />

            <span className={styles.shortcutBadge} aria-hidden="true">
              {shortcutLabel}
            </span>
          </form>

          {showDropdown && (
            <div
              id="top-nav-search-suggestions"
              className={styles.searchDropdown}
              role="listbox"
              aria-label="Search suggestions"
            >
              {searchLoading && suggestions.length === 0 ? (
                <div className={styles.searchEmpty}>Searching…</div>
              ) : suggestions.length === 0 ? (
                <div className={styles.searchEmpty}>
                  No matches for “{query.trim()}”
                </div>
              ) : (
                grouped.map((group) => {
                  const Meta = KIND_META[group.kind];
                  return (
                    <div key={group.kind} className={styles.searchGroup}>
                      <div className={styles.searchGroupLabel}>
                        <Meta.icon size={13} aria-hidden="true" />
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
                            className={`${styles.searchSuggestion} ${
                              active ? styles.searchSuggestionActive : ""
                            }`}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => goToSuggestion(item)}
                          >
                            <span className={styles.searchSuggestionTitle}>
                              {item.title}
                            </span>
                            {item.subtitle ? (
                              <span className={styles.searchSuggestionMeta}>
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

        <div className={styles.rightSection}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="View notifications"
            title="Notifications"
            onClick={onNotificationsClick}
          >
            <Bell size={19} />

            {unreadNotifications > 0 && (
              <span className={styles.notificationBadge}>
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </button>

          <button
            type="button"
            className={styles.iconButton}
            aria-label="Help and support"
            title="Help and support"
            onClick={onHelpClick}
          >
            <CircleHelp size={19} />
          </button>

          <div className={styles.divider} aria-hidden="true" />

          <div
            ref={organisationMenuRef}
            className={styles.dropdownContainer}
          >
            <button
              type="button"
              className={styles.organisationButton}
              aria-haspopup="menu"
              aria-expanded={organisationOpen}
              onClick={() => {
                setOrganisationOpen((current) => !current);
                setProfileOpen(false);
                setSearchOpen(false);
              }}
            >
              <span className={styles.organisationName}>
                {organisationName}
              </span>

              <ChevronDown
                size={15}
                className={
                  organisationOpen
                    ? styles.chevronOpen
                    : styles.chevron
                }
              />
            </button>

            {organisationOpen && (
              <div
                className={styles.organisationMenu}
                role="menu"
              >
                <div className={styles.menuHeader}>
                  <span className={styles.menuLabel}>Organisation</span>
                  <strong>{organisationName}</strong>
                </div>

                <Link
                  href="/settings"
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={() => setOrganisationOpen(false)}
                >
                  <Settings size={16} />
                  Organisation settings
                </Link>
              </div>
            )}
          </div>

          <div ref={profileMenuRef} className={styles.dropdownContainer}>
            <button
              type="button"
              className={styles.avatarButton}
              aria-label={`Open profile menu for ${userName}`}
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              onClick={() => {
                setProfileOpen((current) => !current);
                setOrganisationOpen(false);
                setSearchOpen(false);
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`${userName} profile`}
                  className={styles.avatarImage}
                />
              ) : (
                <span className={styles.avatarFallback}>
                  {initials || "U"}
                </span>
              )}

              <span
                className={styles.onlineIndicator}
                title="Online"
                aria-label="Online"
              />
            </button>

            {profileOpen && (
              <div className={styles.profileMenu} role="menu">
                <div className={styles.profileHeader}>
                  <div className={styles.largeAvatar}>
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt=""
                        className={styles.avatarImage}
                      />
                    ) : (
                      <span className={styles.avatarFallback}>
                        {initials || "U"}
                      </span>
                    )}
                  </div>

                  <div className={styles.profileDetails}>
                    <strong>{userName}</strong>
                    <span>{userEmail}</span>
                  </div>
                </div>

                <div className={styles.menuDivider} />

                <Link
                  href="/settings"
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={() => setProfileOpen(false)}
                >
                  <User size={16} />
                  My profile
                </Link>

                <Link
                  href="/settings"
                  className={styles.menuItem}
                  role="menuitem"
                  onClick={() => setProfileOpen(false)}
                >
                  <Settings size={16} />
                  Account settings
                </Link>

                <div className={styles.menuDivider} />

                <button
                  type="button"
                  className={`${styles.menuItem} ${styles.logoutItem}`}
                  role="menuitem"
                  onClick={handleLogout}
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
