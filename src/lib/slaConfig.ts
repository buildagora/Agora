/**
 * SLA Policy Constants
 * Layer 6: Exception detection and escalation thresholds
 * 
 * These constants define time-based service level agreements (SLAs)
 * for detecting exceptions and triggering escalations.
 */

/**
 * Maximum time (in minutes) after a request is posted before
 * we consider it an exception if no supplier has responded.
 * 
 * Applies to: Request status "posted" with no dispatch records marked "responded"
 */
export const SLA_NO_RESPONSE_MINUTES = 30;

/**
 * Maximum time (in hours) after an order is awarded before
 * we consider it an exception if the seller hasn't confirmed.
 * 
 * Applies to: Order status "awarded" -> should transition to "confirmed"
 */
export const SLA_CONFIRM_HOURS = 4;

/**
 * Maximum time (in hours) after an order is confirmed before
 * we consider it an exception if the seller hasn't scheduled delivery/pickup.
 * 
 * Applies to: Order status "confirmed" -> should transition to "scheduled"
 */
export const SLA_SCHEDULE_HOURS = 24;

/**
 * Maximum time (in hours) after an order is scheduled before
 * we consider it an exception if the order hasn't been delivered.
 * 
 * Note: If the request has a `delivery.needBy` date, that takes precedence
 * over this constant. Otherwise, use this constant from the scheduled timestamp.
 * 
 * Applies to: Order status "scheduled" -> should transition to "delivered"
 */
export const SLA_DELIVERED_HOURS = 72;


