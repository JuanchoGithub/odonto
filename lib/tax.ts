/** Tax-inclusive math: user-typed prices are FINAL (post-tax, IVA incluido).
 * Given a final line total and the rate in bps, back out the tax portion:
 *   tax = round(total * bps / (10000 + bps)), net = total - tax.
 * bps=0 → tax 0. Integer-cents only, never floats for money storage.
 */
export function splitTaxInclusive(totalCents: number, bps: number): {
  net: number;
  tax: number;
} {
  if (!Number.isFinite(totalCents) || totalCents <= 0 || !bps) {
    return { net: totalCents, tax: 0 };
  }
  const tax = Math.round((totalCents * bps) / (10000 + bps));
  return { net: totalCents - tax, tax };
}

export function bpsForTaxKind(
  taxKind: string,
  standardBps: number,
  reducedBps: number,
): number {
  if (taxKind === 'standard') return standardBps;
  if (taxKind === 'reduced') return reducedBps;
  return 0;
}
