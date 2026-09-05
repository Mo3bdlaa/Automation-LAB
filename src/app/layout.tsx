import type { Metadata } from "next";
import "./globals.css";
import { i18n } from "@/i18n/server";
import { getPrincipal } from "@/lib/auth/server";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: { default: "Automation Lab", template: "%s · Automation Lab" },
  description: "Practice sandbox for the Document Understanding & RPA course. Training data only.",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t, dir } = await i18n();
  const principal = await getPrincipal();
  return (
    <html lang={locale} dir={dir}>
      <body className="min-h-screen bg-bg text-ink">
        <Nav t={t} locale={locale} principal={principal} />
        {children}
      </body>
    </html>
  );
}
