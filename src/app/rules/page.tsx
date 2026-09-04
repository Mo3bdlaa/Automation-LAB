import { i18n } from "@/i18n/server";
import { requireLab } from "@/lib/auth/server";
import { Page, Pill } from "@/components/ui";
import { describeRules } from "@/lib/validation/engine";
import { ALL_RULES } from "@/lib/validation/rules";

export default async function RulesPage() {
  const { t } = await i18n();
  await requireLab();
  const rules = describeRules(ALL_RULES);
  const tr = t.rules;
  return (
    <Page title={tr.title}>
      <p className="mb-4 max-w-3xl text-sm text-muted">{tr.intro}</p>
      <div className="overflow-x-auto">
        <table id="rules-table" data-testid="rules-table" className="al-table">
          <thead>
            <tr>
              <th>{tr.id}</th>
              <th>{tr.severity}</th>
              <th>{tr.appliesTo}</th>
              <th>{tr.description}</th>
              <th>{tr.params}</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id} id={`rules-row-${r.id}`} data-testid={`rules-row-${r.id}`} data-severity={r.severity}>
                <td>
                  <code>{r.id}</code>
                </td>
                <td>
                  <Pill>{r.severity}</Pill>
                </td>
                <td>{r.appliesTo}</td>
                <td>{r.description}</td>
                <td>
                  <code>{Object.keys(r.params).length ? JSON.stringify(r.params) : "—"}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted">
        JSON: <a href="/api/rules" className="underline" id="link-api-rules" data-testid="link-api-rules">/api/rules</a>
      </p>
    </Page>
  );
}
