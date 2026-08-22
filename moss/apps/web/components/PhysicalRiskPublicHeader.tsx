'use client';

import { PublicSiteHeader, type PublicNavItem } from './PublicSiteHeader';

export const WORDPRESS_URL = (process.env.NEXT_PUBLIC_WORDPRESS_URL || 'https://test.physicalrisk.com').replace(
  /\/$/,
  '',
);

export const PUBLIC_NAV_LINKS: PublicNavItem[] = [
  { label: 'Home', href: `${WORDPRESS_URL}/` },
  { label: 'About', href: `${WORDPRESS_URL}/#about` },
  { label: 'Security Governance', href: `${WORDPRESS_URL}/#ourservices` },
  { label: 'Customer Solutions', href: `${WORDPRESS_URL}/#ourservices` },
  { label: 'Industries', href: `${WORDPRESS_URL}/#ourservices` },
  { label: 'Insights', href: `${WORDPRESS_URL}/#insights` },
  { label: 'Resources', href: `${WORDPRESS_URL}/#insights` },
  { label: 'Consultant Network', href: `${WORDPRESS_URL}/#insights` },
  { label: 'Contact', href: `${WORDPRESS_URL}/#contact` },
];

/** WordPress-matched top bar + primary navigation (legacy public chrome). */
export function PhysicalRiskPublicHeader() {
  return (
    <>
      <div className="pr-topbar">
        <span>Independent, Accredited &amp; Experienced Security Risk Professionals.</span>
        <div className="pr-topbar-contact">
          <a href="tel:+27824109305">+27 82 410 9305</a>
          <a href="mailto:sales@physicalrisk.com">sales@physicalrisk.com</a>
        </div>
      </div>
      <PublicSiteHeader wordpressUrl={WORDPRESS_URL} items={PUBLIC_NAV_LINKS} />
    </>
  );
}
