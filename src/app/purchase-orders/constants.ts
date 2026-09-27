/**
 * Line rows the PO form opens with. One: an order of a single line is the
 * common case, and four empty rows under it are not a form, they are clutter.
 * Everything past the first is added with `#po-add-line`.
 */
export const PO_FORM_START_LINES = 1;

/**
 * Rows the form will grow to, and the number the server action reads. A
 * generated purchase order runs to eight lines, so the old fixed five was a
 * ceiling a participant could actually hit; this one is a guard against a
 * runaway client rather than a limit anybody meets.
 */
export const PO_FORM_MAX_LINES = 40;
