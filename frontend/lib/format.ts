import type { MoneyAmount } from "@/lib/api";

export function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "12,345.00 USD" for a single currency, "12,345.00 USD · 800.00 EUR" when a
// section mixes currencies — never blended into one (meaningless) number.
export function formatAmounts(amounts: MoneyAmount[]): string {
  if (amounts.length === 0) return "0.00";
  return amounts.map((a) => `${formatMoney(a.amount)} ${a.currency}`).join(" · ");
}
