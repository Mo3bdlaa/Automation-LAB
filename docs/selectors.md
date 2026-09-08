# Selector convention

Every interactive element and every element a bot might read carries **both** a stable
`id` and a `data-testid`. UiPath selectors should target these attributes and nothing else.
Generated class names, element order, and text content are not stable and must not be used.

## Naming

    {area}-{entity}-{purpose}[-{qualifier}]

All lowercase, hyphen-separated. `id` and `data-testid` carry the same value.

| Element | id / data-testid | Example |
|---|---|---|
| Top-level nav link | `nav-{route}` | `nav-vendors`, `nav-purchase-orders` |
| Page heading | `page-title` | |
| Search / filter input | `{entity}-filter-{field}` | `vendors-filter-q` |
| Table | `{entity}-table` | `vendors-table` |
| Table row | `{entity}-row-{code}` | `vendors-row-V-00042` |
| Table cell | `{entity}-cell-{code}-{field}` | `vendors-cell-V-00042-name` |
| Pagination | `{entity}-pager-{prev\|next\|page}` | `vendors-pager-next` |
| Form | `{entity}-form` | `vendor-form` |
| Form field | `{entity}-field-{field}` | `vendor-field-iban` |
| Submit button | `{entity}-submit` | `vendor-submit` |
| Cancel / back link | `{entity}-cancel` | `vendor-cancel` |
| Validation container | `validation-errors` | fixed position, always present, empty when clean |
| One validation error | `validation-error-{RULE-ID}` | `validation-error-VEND-IBAN` |
| Flash / status banner | `flash` | with `data-status="success\|error"` |
| Row action link | `{entity}-action-{verb}-{code}` | `vendors-action-edit-V-00042` |
| Object header status | `{entity}-status-{code}` with `data-status` | `invoice-status-INV-2026-05012` |
| Document card | `{entity}-document` with `data-document-id`, `data-rendered` | `invoice-document` |
| Download link | `{entity}-download` | `po-download` |
| Launchpad tile | `tile-{queue}` with `data-count` | `tile-invoices-pending` |
| Extraction form field | `extraction-field-{field}` / `extraction-field-line-{n}-{field}` | `extraction-field-line-1-unitPrice` |
| Related document link | `related-{kind}-{code}` | `related-grn-GRN-2026-05003` |
| Validation station form | `validation-station-form` | with `#validation-document`, `#validation-fields`, `#validation-lines` |
| Validation station field group | `validate-field-{field}-group` with `data-low-confidence` | `validate-field-invoiceNumber-group` |
| Validation station line row | `validation-line-{n}` | `validation-line-1` |
| API token row | `tokens-row-{id}` with `data-revoked` | inside `#tokens-table` |
| Instructor row | `instructor-row-{userId}` | inside `#instructor-table` |
| Instructor stat tile | `instructor-stat-{key}` with `data-value` | `instructor-stat-averageScore` |
| Difficulty level link | `{entity}-level-{n}` with `data-current` | `invoice-level-3`, `validation-level-3` |
| Document card | also carries `data-level` | `invoice-document[data-level="3"]` |
| Validation station field map | `validation-field-map` with `data-boxes` | one `validation-box-{field}` per field |
| Cohort difficulty form | `difficulty-form`, `difficulty-level`, `difficulty-submit`, `difficulty-current` | `difficulty-current[data-level]` |
| Per-level score tile | `instructor-level-{n}` with `data-extractions`, `data-score` | `instructor-level-3` |
| Sign-up field | `register-field-{field}` | `register-field-email`, `register-field-alias` |
| Sign-up error | `register-error-{field}` | inside `#register-form`, submit is `#register-submit` |
| Profile field | `account-field-{field}` | inside `#account-form`, submit is `#account-submit` |
| Scenario card | `scenario-card-{slug}` | `scenario-card-goods-receipt`, link `scenario-link-goods-receipt` |
| Start a run | `scenario-start-scored`, `scenario-start-practice` | on `/challenges/{slug}` |
| Open run banner | `active-run` with `data-run-id`, `data-scenario`, `data-mode` | `#run-close`, `#run-abandon` |
| Walkthrough step | `walkthrough-step-{n}`, `walkthrough-check-{n}` | inside `#walkthrough`; `#walkthrough-show` / `#walkthrough-hide` |
| Run result | `run-result` with `data-run-id`, `data-score`, `data-passed`, `data-mode` | `#run-score`, `#run-verdict`, `#run-channel`, `#run-processed` |
| Judging row | `judging-{parameter}` | `judging-accuracy`, `judging-exceptions` |
| Run note | `run-note-{n}` | inside `#run-note-list` |
| Publish toggle | `run-publish-toggle`, `run-publish-state` with `data-published` | on `/runs/{id}` |
| Leaderboard row | `board-row-{rank}` with `data-score`, `data-name`; `board-certificate-{rank}` | inside `#board-table` |
| Leaderboard tab | `board-tab-{slug}` with `data-current`; `board-channel-{all\|ui\|api}` | on `/leaderboard` |
| Certificate check | `verify-certificate` with `data-code`, `data-valid`, `data-score`; plus `verify-name`, `verify-score`, `verify-scenario` | on `/verify/{code}` |

## Rules

- Tables are real `<table>` markup with `<thead>` and `<tbody>`. No virtualisation, no
  infinite scroll. Page size is fixed; pagination is by URL query (`?page=2`).
- URLs are predictable: `/vendors/V-00042`, `/purchase-orders/PO-2026-00017`.
- `#validation-errors` also carries `data-count` and `data-blocking` (`1` when any error or
  critical violation is present), so a bot can decide without reading the list.
- Validation errors always render inside `#validation-errors` as a list. Each `<li>` has
  `data-rule-id`, `data-severity`, and a stable `id`. Bots branch on `data-rule-id`, not text.
- No shadow DOM, no canvas, no CAPTCHA. Session cookies last 30 days.
- On the validation station (`/invoices/{internalNumber}/validate`), every field group carries
  `data-low-confidence="1"` when the confidence the bot submitted for that field is below
  0.85, so an attended workflow can jump straight to the fields that need a human.
- `?level=N` on an invoice page or the validation station switches the document to that
  difficulty level (1 native PDF, 2 to 5 scans). The document card and the station both
  carry `data-level`, so a bot can assert which variant it is looking at.
- The challenge walkthrough (`#walkthrough`) is a side panel. It never overlays the page and
  never intercepts pointer events, so a bot driving the screens behaves identically whether
  it is open or closed. Keep it that way.
- Scenario slugs (`goods-receipt`, `invoice-processing`, `vendor-onboarding`,
  `sourcing-award`) appear in URLs, in the API and on certificates. They are a public
  contract: never rename one.
- `?classic=1` on any page requests the plain server-rendered variant with no client-side
  JavaScript hydration beyond what forms need. (P0: all pages are already server-rendered.)
