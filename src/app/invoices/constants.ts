/**
 * Line rows the invoice extraction form opens with. One: the reader adds a row
 * per line they find on the document, rather than starting at a guess and
 * leaving the rest blank. The validation station is the exception — it opens
 * with the lines the capture already found, and grows from there.
 */
export const INVOICE_FORM_START_LINES = 1;

/**
 * Lines a submitted extraction may carry — from the form, the validation
 * station or `POST /api/extractions` alike. The old fixed eight matched the
 * longest invoice the generator makes, which made a rendering detail into the
 * limit of what could be read back; this is a guard, not a ceiling anybody meets.
 */
export const INVOICE_FORM_MAX_LINES = 40;
