import { quantileRank } from "simple-statistics";
import { bucketFor } from "./buckets.js";
import type { BucketStats } from "../types.js";

export interface PercentileResult {
  percentile: number; // 0..1
  bucket: BucketStats | null; // bucket info plus historical win rate at that tier
}

export function rankBet(
  amount: number,
  historicalAmounts: number[],
  buckets: BucketStats[],
  mean: number,
  stddev: number,
): PercentileResult {
  const pct =
    historicalAmounts.length > 0
      ? quantileRank(historicalAmounts, amount)
      : 0;
  const tier = stddev > 0 ? bucketFor(amount, mean, stddev) : null;
  const matched = tier ? buckets.find((b) => b.label === tier.label) ?? null : null;
  return { percentile: pct, bucket: matched };
}
