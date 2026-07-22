const MARKETING_URL = process.env.NEXT_PUBLIC_MARKETING_URL || 'https://physicalrisk.com';

const NAV_LINKS = [
  { label: 'Home', href: `${MARKETING_URL}/` },
  { label: 'About', href: `${MARKETING_URL}/about/` },
  { label: 'Security Governance', href: `${MARKETING_URL}/security-governance/` },
  { label: 'Customer Solutions', href: `${MARKETING_URL}/customer-solutions/` },
  { label: 'Industries', href: `${MARKETING_URL}/industries/` },
  { label: 'Insights', href: `${MARKETING_URL}/insights/` },
  { label: 'Resources', href: `${MARKETING_URL}/resources/` },
  { label: 'Consultant Network', href: `${MARKETING_URL}/consultant-network/` },
  { label: 'Contact', href: `${MARKETING_URL}/contact/` },
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

      <header className="pr-header">
        <a className="pr-brand" href={MARKETING_URL} aria-label="Physical Risk">
          <BrandMark />
        </a>
        <nav className="pr-nav" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <a key={link.label} href={link.href}>{link.label}</a>
          ))}
        </nav>
        <a className="pr-cta" href={`${MARKETING_URL}/#book-moss`}>Book MOSS Assessment</a>
      </header>

      <div className="pr-content">{children}</div>

      <footer className="pr-footer">
        <div className="pr-footer-grid">
          <div>
            <a className="pr-brand" href={MARKETING_URL} aria-label="Physical Risk">
              <BrandMark />
            </a>
            <p>Independent security risk professionals delivering governance, leakage reduction and executive assurance.</p>
          </div>
          <div>
            <h4>Explore</h4>
            <a href={`${MARKETING_URL}/about/`}>About</a>
            <a href={`${MARKETING_URL}/customer-solutions/`}>Customer Solutions</a>
            <a href={`${MARKETING_URL}/industries/`}>Industries</a>
            <a href={`${MARKETING_URL}/insights/`}>Insights</a>
          </div>
          <div>
            <h4>Assessments</h4>
            <a href="/start?source=wordpress">Cost Leakage Questionnaire</a>
            <a href={`${MARKETING_URL}/#book-moss`}>Book MOSS Assessment</a>
          </div>
          <div>
            <h4>Contact</h4>
            <a href="tel:+27210000000">+27 (0) 21 000 0000</a>
            <a href="mailto:info@physicalrisk.com">info@physicalrisk.com</a>
            <a href={`${MARKETING_URL}/contact/`}>Contact form</a>
          </div>
        </div>
        <div className="pr-footer-bottom">
          <span>© {new Date().getFullYear()} Physical Risk. All rights reserved.</span>
          <span>Powered by MOSS</span>
        </div>
      </footer>
    </div>
  );
}
