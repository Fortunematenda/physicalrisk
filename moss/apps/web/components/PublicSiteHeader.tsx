'use client';

import { useEffect, useRef, useState } from 'react';

export type PublicNavItem = {
  label: string;
  href: string;
  children?: PublicNavItem[];
};

const QUESTIONNAIRE_URL = 'https://moss.physicalrisk.com/start?source=wordpress';

export function PublicSiteHeader({
  wordpressUrl,
  items,
}: {
  wordpressUrl: string;
  items: PublicNavItem[];
}) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const keepQuestionnaireProgress = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (window.location.pathname === '/start') event.preventDefault();
    setOpen(false);
  };

  return (
    <header className="public-site-header">
      <div className="public-site-header__inner">
        <a className="public-site-header__brand" href={`${wordpressUrl}/`} aria-label="Physical Risk home">
          <img src="/physical_risk_logo_main.png" alt="Physical Risk" />
        </a>

        <button
          ref={toggleRef}
          className="public-site-header__toggle"
          type="button"
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={open}
          aria-controls="public-site-navigation"
          onClick={() => setOpen((value) => !value)}
        >
          <span />
          <span />
          <span />
        </button>

        <nav
          id="public-site-navigation"
          className={`public-site-header__nav${open ? ' is-open' : ''}`}
          aria-label="Primary navigation"
        >
          <div className="public-site-header__mobile-brand">
            <a href={`${wordpressUrl}/`} aria-label="Physical Risk home" onClick={() => setOpen(false)}>
              <img src="/physical_risk_logo_main.png" alt="Physical Risk" />
            </a>
            <button type="button" aria-label="Close navigation menu" onClick={() => setOpen(false)}>×</button>
          </div>
          <ul>
            {items.map((item) => (
              <li key={item.label}>
                <a href={item.href} onClick={() => setOpen(false)}>{item.label}</a>
                {item.children?.length ? (
                  <ul className="public-site-header__submenu">
                    {item.children.map((child) => (
                      <li key={child.label}><a href={child.href} onClick={() => setOpen(false)}>{child.label}</a></li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>

        <a className="public-site-header__cta" href={QUESTIONNAIRE_URL} onClick={keepQuestionnaireProgress}>
          Book MOSS Assessment
        </a>
      </div>
      <button
        className={`public-site-header__overlay${open ? ' is-open' : ''}`}
        type="button"
        aria-label="Close navigation menu"
        tabIndex={open ? 0 : -1}
        onClick={() => setOpen(false)}
      />
    </header>
  );
}
