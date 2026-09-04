# Identifier formats

Automation Lab's fictional jurisdiction uses these formats. They are close enough to
regional conventions to be recognisable, and every one carries a check digit so that
validation rules (and student bots) can verify them without a lookup.

| Identifier | Format | Check | Rule ID |
|---|---|---|---|
| IBAN | Real country layouts (SA 24, AE 23, EG 29, QA 29, GB 22, DE 22 chars) with fictional bank codes | ISO 7064 mod 97-10 | `VEND-IBAN` |
| Tax registration number | 15 digits, first digit `3` | Luhn over all 15 digits | `VEND-TAXID-FMT` |
| Commercial registration (CR) number | 10 digits | Weighted mod-11: weights 2..10 from the right over the first 9 digits, check = (11 − sum mod 11) mod 11, with 10 → 0 | `VEND-CR-FMT` |
| Vendor code | `V-NNNNN` (shared corpus `V-00001`–`V-00250`, student-created from `V-10001`) | format | `VEND-CODE-FMT` |
| Item code | `ITM-NNNNNN` (shared `ITM-000001`–`ITM-001200`, student-created from `ITM-900001`) | format | `ITEM-CODE-FMT` |
| Purchase order number | `PO-YYYY-NNNNN` (history `00001`+, sandbox `05001`+, student-created `90001`+) | unique per tenant | — |

Worked examples (all fictional):

- Company CR `1010456784`: payload `101045678`, weighted sum 128, 128 mod 11 = 7, check (11 − 7) = 4.
- Company tax ID `300124587600003`: Luhn-valid.
- Reference implementation: `src/lib/generator/checksums.ts`, tests in `src/lib/generator/generator.test.ts`.

Tax codes: `S15` standard 15%, `S05` reduced 5%, `Z00` zero-rated, `EXM` exempt.
Units of measure accepted by `ITEM-UOM`: EA, BOX, PK, RM, SET, L, KG, TON, M, BAG, ROLL, PLT, PR, CTN, HR, DAY.
