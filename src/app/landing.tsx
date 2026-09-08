import Link from "next/link";
import type { Dictionary } from "@/i18n";
import { ScenarioCard } from "@/components/challenge";
import { PARAMETERS, PARAMETER_LABELS, PARAMETER_MEANINGS, SCENARIOS } from "@/lib/challenge/scenarios";

/**
 * What a visitor sees before they have an account. It has one job: make it
 * obvious what the challenge is, what it will judge, and where to start.
 */
export function Landing({ t }: { t: Dictionary }) {
  const tc = t.challenge;
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <section className="al-card mb-6" id="landing-hero" data-testid="landing-hero">
        <h1 className="mb-2 text-3xl font-light text-primary">{tc.heroTitle}</h1>
        <p className="mb-4 max-w-3xl text-muted">{tc.heroLead}</p>
        <div className="flex flex-wrap gap-2">
          <Link id="landing-signup" data-testid="landing-signup" href="/register" className="al-btn">
            {tc.heroCta}
          </Link>
          <Link id="landing-scenarios" data-testid="landing-scenarios" href="/challenges" className="al-btn secondary">
            {tc.heroSecondary}
          </Link>
          <Link id="landing-leaderboard" data-testid="landing-leaderboard" href="/leaderboard" className="al-btn secondary">
            {tc.board}
          </Link>
        </div>
      </section>

      <h2 className="section-title mb-3">{tc.scenarios}</h2>
      <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" id="landing-scenario-cards" data-testid="landing-scenario-cards">
        {SCENARIOS.map((s) => (
          <ScenarioCard key={s.slug} scenario={s} t={t} />
        ))}
      </div>

      <h2 className="section-title mb-3">{tc.judging}</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-5" id="landing-judging" data-testid="landing-judging">
        {PARAMETERS.map((key) => (
          <div key={key} className="al-card" id={`landing-parameter-${key}`} data-testid={`landing-parameter-${key}`}>
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-primary">{PARAMETER_LABELS[key]}</h3>
            <p className="text-sm text-muted">{PARAMETER_MEANINGS[key]}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
