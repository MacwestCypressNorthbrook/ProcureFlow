/**
 * When a requisition line must name a supplier.
 *
 * A priced material is a purchase, and spend can only be accounted for by
 * supplier if every purchase says who from. Labour is deliberately exempt —
 * a gang paid by the day, or a sub-contractor's lump sum, has no supplier in
 * that sense — and so are site expenses. An unpriced line is exempt too, since
 * the engineer often does not know the price; the rule bites once a price (and
 * so a total) is entered, wherever that happens.
 *
 * Shared by the forms, for the early message, and by every route that writes
 * lines, for the guarantee.
 */
export function lineNeedsSupplier(line: {
  category?: string | null
  quantity: number
  unitPrice: number
}): boolean {
  const category = line.category ?? 'material'
  return category === 'material' && line.unitPrice > 0 && line.quantity > 0
}

export const supplierRequiredMessage = (description: string) =>
  `Choose a supplier for "${description || 'this material'}" — a priced material needs one. Labour and expenses do not.`
