/** Totals for one currency. Amounts are added in cents so 0.1 + 0.2 stays 0.3. */
export function totalInCurrency(
  deals: ReadonlyArray<{ amount: number | string; currency: string }>,
  currency: string,
): { amount: number; excluded: number } {
  let cents = 0;
  let excluded = 0;
  for (const deal of deals) {
    if (deal.currency === currency) cents += Math.round(Number(deal.amount) * 100);
    else excluded += 1;
  }
  return { amount: cents / 100, excluded };
}

/** "+2 deals in other currencies not included", or null when nothing was left out. */
export function otherCurrenciesNote(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? "+1 deal in another currency not included"
    : `+${count} deals in other currencies not included`;
}
