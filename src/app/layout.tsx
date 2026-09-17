import type { Metadata } from "next";
import { headers } from "next/headers";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Arabic, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { i18n } from "@/i18n/server";
import { getLabSession, getPrincipal } from "@/lib/auth/server";
import { isStaff } from "@/lib/identity";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/topbar";
import { PublicHeader } from "@/components/shell/public-header";
import { SiteFooter } from "@/components/shell/footer";
import { crumbsFor } from "@/components/shell/crumbs";
import { activeRun } from "@/lib/challenge/runs";
import { RunBanner } from "./challenges/run-banner";

/*
 * Three faces, each with a job. The serif carries titles, because a records
 * system set entirely in one sans reads as a spreadsheet. The sans is the
 * interface. The mono is every code, reference and amount, so a column of
 * figures lines up — in Arabic too, where the numbers stay left to right.
 */
const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans", display: "swap" });
const display = Source_Serif_4({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-display", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });
const arabic = IBM_Plex_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "500", "600", "700"], variable: "--font-arabic", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Automation Lab", template: "%s · Automation Lab" },
  description: "A working procurement-to-pay system to practise document understanding and RPA against. Training data only.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t, dir } = await i18n();
  const principal = await getPrincipal();
  const pathname = (await headers()).get("x-pathname") ?? "/";
  // The open run, fetched once for the whole application rather than by the
  // three pages that used to remember to ask.
  const lab = principal ? await getLabSession() : null;
  const open = lab ? await activeRun(lab) : null;
  const fonts = `${sans.variable} ${display.variable} ${mono.variable} ${arabic.variable}`;

  return (
    <html lang={locale} dir={dir} className={fonts}>
      <body className="min-h-screen bg-bg text-ink">
        {principal ? (
          // Signed in, this is Al-Nahda's system: a sidebar of modules and a
          // bar that says where you are. No footer — an application does not
          // need one, and the fine print belongs where visitors read it.
          <div className="app">
            <Sidebar t={t} locale={locale} staff={isStaff(principal)} current={pathname} />
            <div className="app-main">
              <TopBar t={t} locale={locale} principal={principal} crumbs={crumbsFor(pathname, t)} />
              {open ? (
                <RunBanner
                  t={t}
                  run={{ id: open.id, scenario: open.scenario, mode: open.mode, startedAt: open.startedAt.toISOString(), targets: open.targets.length, closed: open.processedCount }}
                />
              ) : null}
              {children}
            </div>
          </div>
        ) : (
          // Signed out, it is a site: a product header, the page, the fine print.
          <div className="flex min-h-screen flex-col">
            <PublicHeader t={t} locale={locale} current={pathname} />
            {children}
            <SiteFooter t={t} />
          </div>
        )}
      </body>
    </html>
  );
}
