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

/** WordPress home top bar + primary navigation (shared with /start questionnaire). */
export function PhysicalRiskPublicHeader() {
  return (
    <>
      <div className="pr-topbar">
        <span>Independent, Accredited &amp; Experienced Security Risk Professionals</span>
        <div className="pr-topbar-contact">
          <a href="tel:+27210000000">+27 (0) 21 000 0000</a>
          <a href="mailto:info@physicalrisk.com">info@physicalrisk.com</a>
        </div>
      </div>
      <PublicSiteHeader wordpressUrl={WORDPRESS_URL} items={PUBLIC_NAV_LINKS} />
    </>
  );
}
