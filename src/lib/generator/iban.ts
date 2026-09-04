import { ibanCheckDigits } from "./checksums";
import type { Rng } from "./rng";

export interface BankSpec {
  country: string;
  bankCode: string;
  bankName: string;
  swift: string;
  /** Builds the BBAN body after the bank code. */
  body: (rng: Rng) => string;
}

// Bank codes here are fictional. Country layouts follow real IBAN lengths so
// that off-the-shelf IBAN validators accept them, which is the point of the
// exercise: plausible but not real.
export const BANKS: readonly BankSpec[] = [
  { country: "SA", bankCode: "80", bankName: "Al Rajhi Bank", swift: "RJHISARI", body: (r) => r.digits(18) },
  { country: "SA", bankCode: "10", bankName: "Saudi National Bank", swift: "NCBKSAJE", body: (r) => r.digits(18) },
  { country: "SA", bankCode: "45", bankName: "Saudi Awwal Bank", swift: "SABBSARI", body: (r) => r.digits(18) },
  { country: "AE", bankCode: "033", bankName: "Emirates NBD", swift: "EBILAEAD", body: (r) => r.digits(16) },
  { country: "AE", bankCode: "026", bankName: "Abu Dhabi Commercial Bank", swift: "ADCBAEAA", body: (r) => r.digits(16) },
  { country: "EG", bankCode: "0003", bankName: "Banque Misr", swift: "BMISEGCX", body: (r) => r.digits(4) + r.digits(17) },
  { country: "EG", bankCode: "0010", bankName: "Commercial International Bank", swift: "CIBEEGCX", body: (r) => r.digits(4) + r.digits(17) },
  { country: "QA", bankCode: "QNBA", bankName: "Qatar National Bank", swift: "QNBAQAQA", body: (r) => r.digits(21) },
  { country: "GB", bankCode: "BARC", bankName: "Barclays", swift: "BARCGB22", body: (r) => r.digits(6) + r.digits(8) },
  { country: "DE", bankCode: "37040044", bankName: "Commerzbank", swift: "COBADEFF", body: (r) => r.digits(10) },
];

export function makeIban(rng: Rng, bank: BankSpec): string {
  const bban = bank.bankCode + bank.body(rng);
  return bank.country + ibanCheckDigits(bank.country, bban) + bban;
}

export function formatIban(iban: string): string {
  return iban.replace(/(.{4})/g, "$1 ").trim();
}
