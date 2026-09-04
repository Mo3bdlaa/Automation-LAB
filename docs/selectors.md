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

## Rules

- Tables are real `<table>` markup with `<thead>` and `<tbody>`. No virtualisation, no
  infinite scroll. Page size is fixed; pagination is by URL query (`?page=2`).
- URLs are predictable: `/vendors/V-00042`, `/purchase-orders/PO-2026-00017`.
- Validation errors always render inside `#validation-errors` as a list. Each `<li>` has
  `data-rule-id`, `data-severity`, and a stable `id`. Bots branch on `data-rule-id`, not text.
- No shadow DOM, no canvas, no CAPTCHA. Session cookies last 30 days.
- `?classic=1` on any page requests the plain server-rendered variant with no client-side
  JavaScript hydration beyond what forms need. (P0: all pages are already server-rendered.)
