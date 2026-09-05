import { hashString } from "../../generator/rng";

/**
 * Vendor letterhead styling. Each vendor gets a stable accent colour, font
 * pairing and layout variant derived from its code, so documents from
 * different vendors look different (as they do in an AP inbox) while the same
 * vendor is consistent across quotes, delivery notes, invoices and receipts.
 */
export interface VendorBrand {
  accent: string;
  accentSoft: string;
  ink: string;
  layout: 0 | 1 | 2;
  serif: boolean;
}

const PALETTE = ["#1d3557", "#2a6f97", "#6a040f", "#3a5a40", "#7f4f24", "#4a4e69", "#005f73", "#9b2226", "#0b525b", "#6c584c", "#283618", "#1b263b"];

export function vendorBrand(vendorCode: string): VendorBrand {
  const h = hashString(`brand:${vendorCode}`);
  const accent = PALETTE[h % PALETTE.length];
  return { accent, accentSoft: `${accent}1a`, ink: "#111", layout: (h >>> 4) % 3 as 0 | 1 | 2, serif: ((h >>> 8) & 1) === 1 };
}
