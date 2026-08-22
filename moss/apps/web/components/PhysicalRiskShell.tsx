import { PhysicalRiskPublicHeader, WORDPRESS_URL } from './PhysicalRiskPublicHeader';

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
      <PhysicalRiskPublicHeader />

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
            <a href="tel:+27824109305">+27 82 410 9305</a>
            <a href="mailto:sales@physicalrisk.com">sales@physicalrisk.com</a>
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
