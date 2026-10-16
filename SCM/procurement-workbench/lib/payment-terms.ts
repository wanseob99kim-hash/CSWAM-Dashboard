// Vendor payment terms as written in the MDMP and SAP: "EOM+110days",
// "EOM + 120 days", "Invoice + 30days", "Inoice+30days", "NET 120", "Net 60".

export type PaymentTerms = {
  /** "eom": end of the invoice month + days; "invoice": invoice date + days. */
  basis: "eom" | "invoice";
  days: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Null when the text has no recognisable day count (e.g. "Due upon receipt" is 0 days from invoice). */
export function parsePaymentTerms(text: string | null | undefined): PaymentTerms | null {
  const clean = (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const match = /(\d{1,3})/.exec(clean);
  const days = match ? Number(match[1]) : null;
  if (/\beom\b|end of month/.test(clean)) return { basis: "eom", days: days ?? 0 };
  // "Invoice + 30days", "Inoice+30days" (sic), "NET 120", "Net 60"
  if (days !== null) return { basis: "invoice", days };
  if (/upon receipt|advance|prepay|\bcod\b/.test(clean)) return { basis: "invoice", days: 0 };
  return null;
}

/** Payment due date for an invoice dated `invoiceDate` (UTC dates). */
export function paymentDueDate(invoiceDate: Date, terms: PaymentTerms): Date {
  const start =
    terms.basis === "eom"
      ? new Date(Date.UTC(invoiceDate.getUTCFullYear(), invoiceDate.getUTCMonth() + 1, 0))
      : new Date(Date.UTC(invoiceDate.getUTCFullYear(), invoiceDate.getUTCMonth(), invoiceDate.getUTCDate()));
  return new Date(start.getTime() + terms.days * DAY_MS);
}

export function formatPaymentTerms(terms: PaymentTerms | null): string {
  if (!terms) return "Unknown terms";
  return terms.basis === "eom" ? `EOM + ${terms.days} days` : `Invoice + ${terms.days} days`;
}
