/**
 * A delivery receipt only exists when the goods are actually delivered — a
 * customer walking out with the unit never gets one — so the DR fields are
 * hidden and left null for pickup sales.
 *
 * CustomerDeliveryMethod is a free-form tenant lookup (name + record status,
 * no type column), so this classifies by name. Renaming the lookup in
 * Settings → Master data will change the behaviour; a `kind` column on the
 * model is the durable fix.
 */
const PICKUP_NAME = "PICKUP";

/** Anything not recognisably pickup counts as delivered. */
export function isPickupDeliveryMethod(
  name: string | null | undefined,
): boolean {
  if (!name) return false;
  // Tolerate "Pick Up", "pick-up", "PICK UP" — punctuation and case only.
  return name.replace(/[^a-z]/gi, "").toUpperCase() === PICKUP_NAME;
}

/** True when this sale should capture a delivery receipt number and date. */
export function capturesDeliveryReceipt(
  methodName: string | null | undefined,
): boolean {
  return !isPickupDeliveryMethod(methodName);
}
