/**
 * Line rows the PO form opens with. Five covers most orders, and a bot can
 * count on `po-field-line-1-*` … `po-field-line-5-*` being on the page the
 * moment it loads, with no clicking first.
 */
export const PO_FORM_LINES = 5;

/**
 * Rows the form will grow to with `#po-add-line`, and the number of rows the
 * server action reads. A generated purchase order runs to eight lines, so the
 * old fixed five was a ceiling a participant could actually hit; this one is a
 * guard against a runaway client rather than a limit anybody meets.
 */
export const PO_FORM_MAX_LINES = 40;
