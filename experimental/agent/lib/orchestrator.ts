/**
 * ⚠️ NEUTERED - This file is no longer used for RFQ control flow
 * 
 * computeRfqStatus(draft) is the SINGLE AUTHORITY for:
 * - readiness
 * - next question selection
 * - dispatch eligibility
 * 
 * This file is kept for reference only and should NOT be imported or used.
 * All RFQ control logic has been moved to computeRfqStatus.
 * 
 * REPLACEMENT PATTERN:
 * ```typescript
 * const status = computeRfqStatus({ draft });
 * if (!status.isReadyToConfirm) {
 *   assistantText = askQuestion(status.nextQuestionId);
 *   return;
 * }
 * ```
 */

// This file is intentionally empty - all RFQ control logic has been moved to computeRfqStatus
