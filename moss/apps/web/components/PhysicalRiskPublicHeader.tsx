'use client';

import { PublicSiteHeader, type PublicNavItem } from './PublicSiteHeader';

export const WORDPRESS_URL = (process.env.NEXT_PUBLIC_WORDPRESS_URL || 'https://test.physicalrisk.com').replace(
  /\/$/,
  '',
);

/** Same labels and targets as the WordPress home `#menu-main-menu` / `.mheader` nav. */
export const PUBLIC_NAV_LINKS: PublicNavItem[] = [
  { label: 'Security Governance', href: `${WORDPRESS_URL}/#ourservices` },
  { label: 'Customer Solutions', href: `${WORDPRESS_URL}/#ourservices` },
  { label: 'Insights', href: `${WORDPRESS_URL}/#insights` },
  { label: 'Resources', href: `${WORDPRESS_URL}/#insights` },
  { label: 'Consultant Network', href: `${WORDPRESS_URL}/#insights` },
  { label: 'Contact', href: `${WORDPRESS_URL}/#contact` },
];

function PhoneIcon() {
  return (
    <svg className="pr-topbar__icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M25.6 32c-2.834 0-5.849-0.803-8.96-2.387-2.869-1.46-5.703-3.552-8.196-6.048s-4.581-5.332-6.040-8.203c-1.581-3.113-2.383-6.128-2.383-8.962 0-1.837 1.711-3.611 2.447-4.288 1.058-0.974 2.722-2.111 3.931-2.111 0.601 0 1.306 0.393 2.219 1.238 0.681 0.63 1.446 1.485 2.213 2.471 0.462 0.594 2.768 3.633 2.768 5.091 0 1.196-1.352 2.027-2.782 2.906-0.553 0.34-1.125 0.691-1.538 1.023-0.441 0.354-0.52 0.54-0.533 0.582 1.519 3.785 6.161 8.427 9.944 9.943 0.034-0.011 0.221-0.084 0.581-0.534 0.331-0.414 0.683-0.985 1.023-1.538 0.88-1.431 1.71-2.782 2.906-2.782 1.458 0 4.497 2.306 5.091 2.768 0.986 0.767 1.841 1.532 2.471 2.213 0.845 0.912 1.238 1.617 1.238 2.218 0 1.209-1.137 2.879-2.11 3.941-0.678 0.739-2.453 2.459-4.29 2.459z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg className="pr-topbar__icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M29 4h-26c-1.65 0-3 1.35-3 3v18c0 1.65 1.35 3 3 3h26c1.65 0 3-1.35 3-3v-18c0-1.65-1.35-3-3-3zM12.461 17.801l-8.461-6.535v-1.645l9.669 7.47c0.493 0.381 1.099 0.572 1.705 0.572 0.595 0 1.19-0.184 1.702-0.552l9.924-7.49v1.661l-8.994 6.529c-0.807 0.586-1.815 0.908-2.852 0.908s-2.046-0.322-2.693-0.918zM30 24.986c0 0.548-0.452 1.014-1 1.014h-26c-0.548 0-1-0.466-1-1.014v-15.068l9.207 7.111c0.888 0.686 1.978 1.055 3.117 1.055s2.229-0.369 3.116-1.055l10.56-7.111v15.068z" />
    </svg>
  );
}

function GlobeIcon() {
  return (
    <svg className="pr-topbar__globe" viewBox="0 0 11 11" fill="none" aria-hidden="true" focusable="false">
      <g opacity="0.6">
        <path
          d="M5.5 10.083a4.583 4.583 0 1 0 0-9.166 4.583 4.583 0 0 0 0 9.166Z"
          stroke="white"
          strokeOpacity="0.6"
          strokeWidth="0.917"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M3.667 5.5c0-1.706.656-3.348 1.833-4.583 1.177 1.235 1.833 2.877 1.833 4.583S6.677 8.848 5.5 10.083C4.323 8.848 3.667 7.207 3.667 5.5Z"
          stroke="white"
          strokeOpacity="0.6"
          strokeWidth="0.917"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M.917 5.5h9.166"
          stroke="white"
          strokeOpacity="0.6"
          strokeWidth="0.917"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** WordPress home top bar + primary navigation (shared with /start questionnaire). */
export function PhysicalRiskPublicHeader() {
  return (
    <>
      <div className="pr-topbar">
        <div className="pr-topbar__inner">
          <span className="pr-topbar__tagline">
            Independent, Accredited &amp; Experienced Security Risk Professionals
          </span>
          <div className="pr-topbar__right">
            <div className="pr-topbar-contact">
              <a href="tel:+27210000000">
                <PhoneIcon />
                <span>+27 (0) 21 000 0000</span>
              </a>
              <a href="mailto:info@physicalrisk.com">
                <MailIcon />
                <span>info@physicalrisk.com</span>
              </a>
            </div>
            <span className="pr-topbar__locale" aria-hidden="true">
              <GlobeIcon />
            </span>
          </div>
        </div>
      </div>
      <PublicSiteHeader wordpressUrl={WORDPRESS_URL} items={PUBLIC_NAV_LINKS} />
    </>
  );
}
