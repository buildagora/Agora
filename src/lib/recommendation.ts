/**
 * Deterministic Recommendation Engine
 * NO AI - Transparent scoring rules only
 */

import { Quote } from "./quote";
import { RFQRequest } from "./request";
import { getSupplierMetrics } from "./supplierMetrics";

/**
 * Supplier signals (optional metadata for ranking)
 */
export interface SupplierSignals {
  preferredSellerIds?: string[]; // Buyer's preferred sellers for this request
  reliabilityScores?: Record<string, number>; // sellerId -> reliability score (0-1)
}

/**
 * Score breakdown for transparency
 */
export interface ScoreBreakdown {
  priceComponent: number; // Price score contribution
  speedComponent: number; // Speed score contribution
  completenessComponent: number; // Completeness score contribution
  preferredBonus: number; // Preferred supplier bonus (if applicable)
  reliabilityBonus: number; // Reliability bonus (if applicable)
  totalScore: number; // Final computed score
  priceUsed: number | null; // Exact price value used
  leadTimeUsed: number | null; // Exact lead time value used (in days)
}

/**
 * Ranking result for a single quote
 */
export interface QuoteRanking {
  quote: Quote;
  score: number; // Final computed score (higher is better)
  reasons: string[]; // Max 3 short bullet points explaining the score
  breakdown?: ScoreBreakdown; // Optional score breakdown for transparency
}

/**
 * Recommendation result
 */
export interface RecommendationResult {
  recommended: Quote | null; // Top-ranked quote (or null if no valid quotes)
  backup: Quote | null; // Second-ranked quote (or null if < 2 valid quotes)
  ranking: QuoteRanking[]; // All quotes ranked by score (descending)
}

/**
 * Scoring configuration
 */
const SCORING_CONFIG = {
  PRICE_WEIGHT: 0.5, // Weight for price score (0-1)
  SPEED_WEIGHT: 0.3, // Weight for speed score (0-1)
  COMPLETENESS_WEIGHT: 0.2, // Weight for completeness (penalty)
  PREFERRED_BONUS: 0.15, // Bonus score for preferred suppliers
  RELIABILITY_WEIGHT: 0.1, // Weight for reliability (if available)
  INCOMPLETE_PENALTY: -0.5, // Heavy penalty for missing critical fields
} as const;

/**
 * Check if a quote is complete (has all required fields for ranking)
 * 
 * @param quote Quote to check
 * @returns true if quote has price and lead time
 */
function isQuoteComplete(quote: Quote): boolean {
  // Must have totalPrice and leadTimeDays
  return (
    quote.totalPrice !== undefined &&
    quote.totalPrice !== null &&
    !isNaN(quote.totalPrice) &&
    quote.totalPrice >= 0 &&
    (quote.leadTimeDays !== undefined && quote.leadTimeDays !== null && !isNaN(quote.leadTimeDays) && quote.leadTimeDays > 0)
  );
}

/**
 * Compute price score (cheaper is better)
 * Normalized relative to lowest price quote
 * 
 * @param quote Quote to score
 * @param allQuotes All quotes for normalization
 * @returns Price score (0-1, higher is better)
 */
function computePriceScore(quote: Quote, allQuotes: Quote[]): number {
  // Safely extract price from quote
  const quotePrice = quote?.totalPrice;
  if (quotePrice === undefined || quotePrice === null || isNaN(quotePrice) || quotePrice < 0) {
    return 0; // Missing or invalid price gets 0 score
  }
  
  // Find lowest total price (safely)
  const prices = allQuotes
    .map((q) => q?.totalPrice)
    .filter((p) => p !== undefined && p !== null && !isNaN(p) && p >= 0) as number[];
  
  if (prices.length === 0) {
    return 0;
  }
  
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  
  // If all prices are the same, return 1.0
  if (minPrice === maxPrice) {
    return 1.0;
  }
  
  // Normalize: cheaper = higher score
  // Score = 1 - ((price - minPrice) / (maxPrice - minPrice))
  const normalizedScore = 1 - ((quotePrice - minPrice) / (maxPrice - minPrice));
  
  // Ensure score is between 0 and 1
  return Math.max(0, Math.min(1, normalizedScore));
}

/**
 * Compute speed score (faster lead time is better)
 * Normalized relative to fastest quote
 * 
 * @param quote Quote to score
 * @param allQuotes All quotes for normalization
 * @returns Speed score (0-1, higher is better)
 */
function computeSpeedScore(quote: Quote, allQuotes: Quote[]): number {
  // Safely extract lead time from quote
  const quoteLeadTime = quote?.leadTimeDays;
  
  // Filter quotes with valid leadTimeDays (safely)
  const leadTimes = allQuotes
    .map((q) => q?.leadTimeDays)
    .filter((lt) => lt !== undefined && lt !== null && !isNaN(lt) && lt > 0) as number[];
  
  if (leadTimes.length === 0) {
    return 0;
  }
  
  // If this quote doesn't have lead time, return 0
  if (quoteLeadTime === undefined || quoteLeadTime === null || isNaN(quoteLeadTime) || quoteLeadTime <= 0) {
    return 0;
  }
  
  const minLeadTime = Math.min(...leadTimes);
  const maxLeadTime = Math.max(...leadTimes);
  
  // If all lead times are the same, return 1.0
  if (minLeadTime === maxLeadTime) {
    return 1.0;
  }
  
  // Normalize: faster = higher score
  // Score = 1 - ((leadTime - minLeadTime) / (maxLeadTime - minLeadTime))
  const normalizedScore = 1 - ((quoteLeadTime - minLeadTime) / (maxLeadTime - minLeadTime));
  
  // Ensure score is between 0 and 1
  return Math.max(0, Math.min(1, normalizedScore));
}

/**
 * Compute completeness score (penalty for missing fields)
 * 
 * @param quote Quote to score
 * @returns Completeness score (0-1, higher is better)
 */
function computeCompletenessScore(quote: Quote): number {
  if (!quote) {
    return 0; // Malformed quote gets 0
  }
  
  let score = 1.0;
  
  // Check for missing critical fields (safely)
  const totalPrice = quote.totalPrice;
  if (totalPrice === undefined || totalPrice === null || isNaN(totalPrice)) {
    score -= 0.5; // Heavy penalty
  }
  
  const leadTimeDays = quote.leadTimeDays;
  if (leadTimeDays === undefined || leadTimeDays === null || isNaN(leadTimeDays) || leadTimeDays <= 0) {
    score -= 0.5; // Heavy penalty
  }
  
  // Ensure score is between 0 and 1
  return Math.max(0, Math.min(1, score));
}

/**
 * Check if seller is preferred
 * 
 * @param quote Quote to check
 * @param request Request context
 * @param supplierSignals Optional supplier signals
 * @returns true if seller is preferred
 */
function isPreferredSupplier(
  quote: Quote,
  request: RFQRequest,
  supplierSignals?: SupplierSignals
): boolean {
  // Check supplierSignals first (if provided)
  if (supplierSignals?.preferredSellerIds?.includes(quote.sellerId)) {
    return true;
  }
  
  // Fallback: check preferred suppliers from storage
  try {
    const requestCategory = request.items[0]?.category || "unknown";
    // TODO: Replace with API call to /api/buyer/preferred-suppliers?categoryId=...
    // For now, return false deterministically (no legacy preferredSuppliers module)
    return false;
  } catch {
    return false;
  }
}

/**
 * Get reliability score for a seller
 * Computes a composite reliability score from supplier metrics
 * 
 * @param quote Quote to check
 * @param supplierSignals Optional supplier signals (for precomputed scores)
 * @returns Reliability score (0-1, default 0 if no data)
 */
function getReliabilityScore(quote: Quote, supplierSignals?: SupplierSignals): number {
  // First check if precomputed score is provided
  if (supplierSignals?.reliabilityScores?.[quote.sellerId] !== undefined) {
    const score = supplierSignals.reliabilityScores[quote.sellerId];
    // Ensure score is between 0 and 1
    return Math.max(0, Math.min(1, score));
  }
  
  // Otherwise, compute from metrics
  try {
    const metrics = getSupplierMetrics(quote.sellerId, 30);
    
    // Check if we have any reliability data
    const hasData = 
      (typeof metrics.responseRate === "number") ||
      (typeof metrics.medianResponseTimeMinutes === "number") ||
      (typeof metrics.onTimeConfirmRate === "number") ||
      (typeof metrics.onTimeDeliveryRate === "number");
    
    if (!hasData) {
      return 0; // No data available
    }
    
    // Compute composite reliability score (0-1)
    // Weight: response rate (0.3), response time (0.3), on-time confirm (0.2), on-time delivery (0.2)
    let score = 0;
    let weightSum = 0;
    
    // Response rate: higher is better
    if (typeof metrics.responseRate === "number") {
      score += metrics.responseRate * 0.3;
      weightSum += 0.3;
    }
    
    // Response time: lower is better (inverse, normalized to 0-1)
    if (typeof metrics.medianResponseTimeMinutes === "number") {
      const maxTime = 240; // 4 hours max
      const normalizedTime = Math.min(metrics.medianResponseTimeMinutes, maxTime);
      const timeScore = (maxTime - normalizedTime) / maxTime;
      score += timeScore * 0.3;
      weightSum += 0.3;
    }
    
    // On-time confirm rate: higher is better
    if (typeof metrics.onTimeConfirmRate === "number") {
      score += metrics.onTimeConfirmRate * 0.2;
      weightSum += 0.2;
    }
    
    // On-time delivery rate: higher is better
    if (typeof metrics.onTimeDeliveryRate === "number") {
      score += metrics.onTimeDeliveryRate * 0.2;
      weightSum += 0.2;
    }
    
    // Normalize by weight sum (if we have partial data)
    if (weightSum > 0) {
      score = score / weightSum;
    }
    
    return Math.max(0, Math.min(1, score));
  } catch {
    return 0; // Error computing metrics
  }
}

/**
 * Get reliability reasons for a seller
 * Returns human-readable reasons based on supplier metrics
 * 
 * @param quote Quote to check
 * @returns Array of reliability reason strings (empty if no data)
 */
function getReliabilityReasons(quote: Quote): string[] {
  const reasons: string[] = [];
  
  try {
    const metrics = getSupplierMetrics(quote.sellerId, 30);
    
    // Check if we have any data
    const hasData = 
      (typeof metrics.responseRate === "number") ||
      (typeof metrics.medianResponseTimeMinutes === "number") ||
      (typeof metrics.onTimeConfirmRate === "number") ||
      (typeof metrics.onTimeDeliveryRate === "number");
    
    if (!hasData) {
      return []; // No data, no reasons
    }
    
    // Fast responder: median response time < 60 minutes
    if (typeof metrics.medianResponseTimeMinutes === "number" && metrics.medianResponseTimeMinutes < 60) {
      reasons.push("Historically fast to respond");
    }
    
    // High on-time delivery: delivery rate > 0.9
    if (typeof metrics.onTimeDeliveryRate === "number" && metrics.onTimeDeliveryRate > 0.9) {
      reasons.push("High on-time delivery rate");
    }
    
    // Low reliability: late confirmations (confirm rate < 0.7)
    if (typeof metrics.onTimeConfirmRate === "number" && metrics.onTimeConfirmRate < 0.7) {
      reasons.push("Low reliability (late confirmations)");
    }
    
    // Low reliability: late deliveries (delivery rate < 0.7)
    if (typeof metrics.onTimeDeliveryRate === "number" && metrics.onTimeDeliveryRate < 0.7) {
      // Only add if we haven't already added a delivery-related reason
      if (!reasons.some((r) => r.includes("delivery"))) {
        reasons.push("Low reliability (late deliveries)");
      }
    }
    
    return reasons;
  } catch {
    return []; // Error computing metrics
  }
}

/**
 * Generate reasons for a quote's score (max 3 bullets)
 * 
 * @param quote Quote to generate reasons for
 * @param allQuotes All quotes for comparison
 * @param request Request context
 * @param supplierSignals Optional supplier signals
 * @param priceScore Price score (0-1)
 * @param speedScore Speed score (0-1)
 * @param completenessScore Completeness score (0-1)
 * @param isPreferred Whether seller is preferred
 * @returns Array of reason strings (max 3)
 */
function generateReasons(
  quote: Quote,
  allQuotes: Quote[],
  request: RFQRequest,
  _supplierSignals: SupplierSignals | undefined,
  priceScore: number,
  speedScore: number,
  completenessScore: number,
  isPreferred: boolean
): string[] {
  if (!quote) {
    return ["Quote data incomplete (penalty)"];
  }
  
  const reasons: string[] = [];
  const bidCount = allQuotes.length;
  const isPickup = request.delivery?.mode === "pickup" || 
                   (request.delivery?.mode === undefined && 
                    (request as any).fulfillmentType === "PICKUP");
  
  // Special case: Only one bid
  if (bidCount === 1) {
    reasons.push("Only bid received");
    // Limit to 1 reason for single bid
    return reasons;
  }
  
  // Only show comparison-based reasons if we have 2+ bids
  if (bidCount >= 2) {
    // Check if this quote has the lowest price (safely)
    const prices = allQuotes
      .map((q) => q?.totalPrice)
      .filter((p) => p !== undefined && p !== null && !isNaN(p) && p >= 0) as number[];
    if (prices.length > 0) {
      const minPrice = Math.min(...prices);
      const quotePrice = quote.totalPrice;
      // Only show "Lowest total price" if this is strictly the lowest (or tied with others)
      if (quotePrice !== undefined && quotePrice !== null && !isNaN(quotePrice) && quotePrice === minPrice && priceScore > 0) {
        // Check if there are multiple quotes with the same lowest price
        const lowestPriceCount = prices.filter(p => p === minPrice).length;
        if (lowestPriceCount === 1) {
          reasons.push("Lowest total price");
        } else if (lowestPriceCount > 1) {
          reasons.push("Lowest total price (tied)");
        }
      }
    }
    
    // Check if this quote has the fastest lead time (safely)
    // ONLY if NOT pickup (delivery-based reasons don't apply to pickup)
    if (!isPickup) {
      const leadTimes = allQuotes
        .map((q) => q?.leadTimeDays)
        .filter((lt) => lt !== undefined && lt !== null && !isNaN(lt) && lt > 0) as number[];
      if (leadTimes.length > 0) {
        const minLeadTime = Math.min(...leadTimes);
        const quoteLeadTime = quote.leadTimeDays;
        if (quoteLeadTime !== undefined && quoteLeadTime !== null && !isNaN(quoteLeadTime) && quoteLeadTime > 0 && quoteLeadTime === minLeadTime && speedScore > 0) {
          // Check if there are multiple quotes with the same fastest lead time
          const fastestLeadTimeCount = leadTimes.filter(lt => lt === minLeadTime).length;
          if (fastestLeadTimeCount === 1) {
            reasons.push("Fastest delivery");
          } else if (fastestLeadTimeCount > 1) {
            reasons.push("Fastest delivery (tied)");
          }
        }
      }
    }
  }
  
  // Preferred supplier
  if (isPreferred) {
    reasons.push("Preferred supplier");
  }
  
  // Reliability reasons (only if data exists)
  const reliabilityReasons = getReliabilityReasons(quote);
  if (reliabilityReasons.length > 0) {
    // Add reliability reasons (prioritize positive ones)
    const positiveReasons = reliabilityReasons.filter((r) => !r.includes("Low reliability"));
    const negativeReasons = reliabilityReasons.filter((r) => r.includes("Low reliability"));
    
    // Add positive reasons first
    for (const reason of positiveReasons) {
      if (reasons.length < 3) {
        reasons.push(reason);
      }
    }
    
    // Add negative reasons if space allows
    for (const reason of negativeReasons) {
      if (reasons.length < 3) {
        reasons.push(reason);
      }
    }
  }
  
  // Completeness penalties
  if (completenessScore < 1.0) {
    const missingFields: string[] = [];
    const totalPrice = quote.totalPrice;
    if (totalPrice === undefined || totalPrice === null || isNaN(totalPrice)) {
      missingFields.push("price");
    }
    const leadTimeDays = quote.leadTimeDays;
    if (leadTimeDays === undefined || leadTimeDays === null || isNaN(leadTimeDays) || leadTimeDays <= 0) {
      missingFields.push("lead time");
    }
    if (missingFields.length > 0) {
      reasons.push(`Incomplete ${missingFields.join(" and ")} info (penalty)`);
    }
  }
  
  // Limit to 3 reasons
  return reasons.slice(0, 3);
}

/**
 * Recommend quotes for a request
 * Deterministic scoring engine with transparent rules
 * 
 * @param request Request object
 * @param quotes Array of quotes to rank
 * @param supplierSignals Optional supplier signals (preferred sellers, reliability scores)
 * @returns Recommendation result with ranked quotes
 */
export function recommendForRequest(
  request: RFQRequest,
  quotes: Quote[],
  supplierSignals?: SupplierSignals
): RecommendationResult {
  // Filter out invalid quotes (must have sellerId)
  const validQuotes = quotes.filter((q) => q.sellerId && q.sellerId.trim().length > 0);
  
  if (validQuotes.length === 0) {
    return {
      recommended: null,
      backup: null,
      ranking: [],
    };
  }
  
  // Compute scores for each quote (with error handling for malformed quotes)
  const rankings: QuoteRanking[] = validQuotes.map((quote) => {
    try {
      // Start score at 0
      let score = 0;
      
      // Price score (cheaper is better)
      const priceScore = computePriceScore(quote, validQuotes);
      const priceComponent = priceScore * SCORING_CONFIG.PRICE_WEIGHT;
      score += priceComponent;
      
      // Speed score (faster is better)
      const speedScore = computeSpeedScore(quote, validQuotes);
      const speedComponent = speedScore * SCORING_CONFIG.SPEED_WEIGHT;
      score += speedComponent;
      
      // Completeness score (penalty for missing fields)
      const completenessScore = computeCompletenessScore(quote);
      const completenessComponent = completenessScore * SCORING_CONFIG.COMPLETENESS_WEIGHT;
      score += completenessComponent;
      
      // Preferred supplier bonus
      const isPreferred = isPreferredSupplier(quote, request, supplierSignals);
      const preferredBonus = isPreferred ? SCORING_CONFIG.PREFERRED_BONUS : 0;
      if (isPreferred) {
        score += preferredBonus;
      }
      
      // Reliability bonus (if available)
      const reliabilityScore = getReliabilityScore(quote, supplierSignals);
      const reliabilityBonus = reliabilityScore > 0 
        ? reliabilityScore * SCORING_CONFIG.RELIABILITY_WEIGHT 
        : 0; // Only apply if we have data
      score += reliabilityBonus;
      
      // Generate reasons
      const reasons = generateReasons(
        quote,
        validQuotes,
        request,
        supplierSignals,
        priceScore,
        speedScore,
        completenessScore,
        isPreferred
      );
      
      // Build score breakdown
      // Only include reliabilityBonus in breakdown if we have data
      const breakdown: ScoreBreakdown = {
        priceComponent,
        speedComponent,
        completenessComponent,
        preferredBonus,
        reliabilityBonus: reliabilityScore > 0 ? reliabilityBonus : 0, // Only show if data exists
        totalScore: score,
        priceUsed: quote.totalPrice ?? null,
        leadTimeUsed: quote.leadTimeDays ?? null,
      };
      
      return {
        quote,
        score,
        reasons,
        breakdown,
      };
    } catch (error) {
      // If scoring fails for a quote, include it with a very low score
      // This prevents runtime errors while still showing the quote
      if (process.env.NODE_ENV === "development") {
        console.error("Error scoring quote:", error, quote);
      }
      return {
        quote,
        score: -1, // Very low score for malformed quotes
        reasons: ["Quote data incomplete (penalty)"],
      };
    }
  });
  
  // Sort by score descending (higher is better)
  // Tie-breaking: 1) total price (lower), 2) lead time (faster), 3) earliest submittedAt
  rankings.sort((a, b) => {
    // Primary: score (higher is better)
    if (Math.abs(b.score - a.score) > 0.0001) {
      return b.score - a.score;
    }
    
    // Tie-breaker 1: total price (lower is better)
    const priceA = a.quote.totalPrice ?? Infinity;
    const priceB = b.quote.totalPrice ?? Infinity;
    if (Math.abs(priceA - priceB) > 0.01) {
      return priceA - priceB;
    }
    
    // Tie-breaker 2: lead time (faster is better)
    const leadTimeA = a.quote.leadTimeDays ?? Infinity;
    const leadTimeB = b.quote.leadTimeDays ?? Infinity;
    if (Math.abs(leadTimeA - leadTimeB) > 0.1) {
      return leadTimeA - leadTimeB;
    }
    
    // Tie-breaker 3: earliest submittedAt (earlier is better)
    // Safely handle missing/invalid dates
    const dateA = a.quote.submittedAt ? new Date(a.quote.submittedAt).getTime() : Infinity;
    const dateB = b.quote.submittedAt ? new Date(b.quote.submittedAt).getTime() : Infinity;
    // If either date is invalid, prefer the one with a valid date
    if (isNaN(dateA) && isNaN(dateB)) {
      return 0; // Both invalid, maintain order
    }
    if (isNaN(dateA)) {
      return 1; // A is invalid, prefer B
    }
    if (isNaN(dateB)) {
      return -1; // B is invalid, prefer A
    }
    return dateA - dateB;
  });
  
  // Filter out incomplete quotes from recommendation (but keep in ranking)
  const completeRankings = rankings.filter((r) => isQuoteComplete(r.quote));
  
  // Recommended = top-ranked complete quote
  // If 0 quotes: recommended = null
  // If 1 quote: still recommend it (but reasons will show "Only bid received")
  // If 2+ quotes: recommend the top-ranked one
  let recommended: Quote | null = null;
  if (completeRankings.length > 0) {
    recommended = completeRankings[0].quote;
  } else if (rankings.length === 1) {
    // Special case: if only 1 quote exists, recommend it even if incomplete
    // Reasons will be handled in generateReasons to show "Only bid received"
    recommended = rankings[0].quote;
  }
  
  // Backup = second-ranked complete quote (or null if < 2 complete quotes)
  const backup = completeRankings.length > 1 ? completeRankings[1].quote : null;
  
  return {
    recommended,
    backup,
    ranking: rankings, // All quotes ranked (including incomplete)
  };
}

