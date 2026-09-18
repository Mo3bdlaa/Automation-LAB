import type { Dictionary } from "@/i18n";

/**
 * The fine print, in the one place fine print belongs.
 *
 * This paragraph carries what the banner across every page used to shout: the
 * company is invented, the data is generated, and the lab is nobody's official
 * certification.
 */
export function SiteFooter({ t }: { t: Dictionary }) {
  return (
    <footer className="site-footer" data-testid="site-footer">
      <div className="footer-inner">
        <p className="footer-note">{t.specimenLong}</p>
        <a href="/api/docs">{t.nav.apiDocs}</a>
        <a href="/api/health">{t.footer.status}</a>
      </div>
    </footer>
  );
}
