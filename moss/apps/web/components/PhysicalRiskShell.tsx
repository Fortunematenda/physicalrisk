import { PublicSiteHeader, type PublicNavItem } from './PublicSiteHeader';

const WORDPRESS_URL = (process.env.NEXT_PUBLIC_WORDPRESS_URL || 'https://test.physicalrisk.com').replace(/\/$/, '');

const NAV_LINKS: PublicNavItem[] = [
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

function BrandMark() {
  return (
    <img
      src="/physical_risk_logo_main.png"
      alt="Physical Risk"
      className="pr-brand-logo"
    />
  );
}

export function PhysicalRiskShell({ children }: { children: React.ReactNode; active?: string }) {
  return (
    <div className="pr-site">
      <div className="pr-topbar">
        <span>Independent, Accredited &amp; Experienced Security Risk Professionals.</span>
        <div className="pr-topbar-contact">
          <a href="tel:+27210000000">+27 (0) 21 000 0000</a>
          <a href="mailto:info@physicalrisk.com">info@physicalrisk.com</a>
        </div>
      </div>

      <PublicSiteHeader wordpressUrl={WORDPRESS_URL} items={NAV_LINKS} />

      <div className="pr-content">{children}</div>

      <footer className="pr-footer">
        <div className="pr-footer-grid">
          <div>
            <a className="pr-brand" href={`${WORDPRESS_URL}/`} aria-label="Physical Risk">
              <BrandMark />
            </a>
            <p>Independent security risk professionals delivering governance, leakage reduction and executive assurance.</p>
          </div>
          <div>
            <h4>Explore</h4>
            <a href={`${WORDPRESS_URL}/#about`}>About</a>
            <a href={`${WORDPRESS_URL}/#ourservices`}>Customer Solutions</a>
            <a href={`${WORDPRESS_URL}/#ourservices`}>Industries</a>
            <a href={`${WORDPRESS_URL}/#insights`}>Insights</a>
          </div>
          <div>
            <h4>Assessments</h4>
            <a href="/start?source=wordpress">Cost Leakage Questionnaire</a>
            <a href="https://moss.physicalrisk.com/start?source=wordpress">Book MOSS Assessment</a>
          </div>
          <div>
            <h4>Contact</h4>
            <a href="tel:+27210000000">+27 (0) 21 000 0000</a>
            <a href="mailto:info@physicalrisk.com">info@physicalrisk.com</a>
            <a href={`${WORDPRESS_URL}/#contact`}>Contact form</a>
          </div>
        </div>
        <div className="pr-footer-bottom">
          <span>© {new Date().getFullYear()} Physical Risk. All rights reserved.</span>
          <span>Powered by Bretune Technologies</span>
        </div>
      </footer>
    </div>
  );
}
