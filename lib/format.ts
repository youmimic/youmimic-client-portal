// Shared display formatting for the customer portal. Australian locale
// throughout, so dates read as 21 Sept 2026 rather than in a North American
// order.

export function formatDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-AU", { year: "numeric", month: "long", day: "numeric" }).format(new Date(date));
}

export function formatShortDate(date: Date | string): string {
  return new Intl.DateTimeFormat("en-AU", { year: "numeric", month: "short", day: "numeric" }).format(new Date(date));
}

export function formatCurrencyCents(cents: number): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100);
}
