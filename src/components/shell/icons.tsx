/**
 * The few glyphs the shell needs, inline so they take the colour around them
 * and cost no request. Deliberately not an icon set: the interface is a
 * records system, and a label is clearer than a picture of a lorry.
 */
export function HomeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2 6.5 8 2l6 4.5V14H2V6.5Z" />
      <path d="M6.5 14V9h3v5" />
    </svg>
  );
}

export function StarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M8 1.7 9.9 5.6l4.3.6-3.1 3 .7 4.3L8 11.5 4.2 13.5l.7-4.3-3.1-3 4.3-.6L8 1.7Z" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.5 10.5 3 3" />
    </svg>
  );
}
