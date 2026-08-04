/** Sentinel for sales encode when the real serial is not known yet. */
export const TO_FOLLOW_SERIAL_ID = "TO-FOLLOW";
export const TO_FOLLOW_SERIAL_LABEL = "TO-FOLLOW";

/** True when the picker value is the TO-FOLLOW placeholder (not a DB serial id). */
export function isToFollowSerial(value: string | null | undefined): boolean {
  return value === TO_FOLLOW_SERIAL_ID;
}
