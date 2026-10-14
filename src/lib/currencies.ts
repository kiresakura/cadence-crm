/** Currencies listed first in the reporting currency picker. */
export const COMMON_CURRENCIES = [
  "USD",
  "EUR",
  "TWD",
  "JPY",
  "GBP",
  "CNY",
  "HKD",
  "SGD",
  "AUD",
  "CAD",
] as const;

/** ISO 4217 codes known to the runtime, plus the common ones in case its data is trimmed. */
export const CURRENCY_CODES: readonly string[] = [
  ...new Set([...COMMON_CURRENCIES, ...Intl.supportedValuesOf("currency")]),
].sort();

const names = new Intl.DisplayNames(["en"], { type: "currency" });

/** "TWD" -> "New Taiwan Dollar". */
export function currencyName(code: string): string {
  return names.of(code) ?? code;
}
