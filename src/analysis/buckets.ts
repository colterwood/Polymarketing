import type { BetRecord, BucketStats } from "../types.js";

export interface BucketDef {
  label: string;
  lower: number | null;
  upper: number | null;
}

export function stddevBucketDefs(mean: number, stddev: number): BucketDef[] {
  return [
    { label: "≤ μ−2σ", lower: null, upper: mean - 2 * stddev },
    {
      label: "(μ−2σ, μ−σ]",
      lower: mean - 2 * stddev,
      upper: mean - 1 * stddev,
    },
    { label: "(μ−σ, μ]", lower: mean - stddev, upper: mean },
    { label: "(μ, μ+σ]", lower: mean, upper: mean + stddev },
    {
      label: "(μ+σ, μ+2σ]",
      lower: mean + stddev,
      upper: mean + 2 * stddev,
    },
    { label: "> μ+2σ", lower: mean + 2 * stddev, upper: null },
  ];
}

function inBucket(amount: number, b: BucketDef): boolean {
  if (b.lower === null && b.upper !== null) return amount <= b.upper;
  if (b.upper === null && b.lower !== null) return amount > b.lower;
  if (b.lower !== null && b.upper !== null)
    return amount > b.lower && amount <= b.upper;
  return true;
}

export function bucketizeBets(
  bets: BetRecord[],
  mean: number,
  stddev: number,
): BucketStats[] {
  const defs = stddevBucketDefs(mean, stddev);
  return defs.map((d) => {
    const inB = bets.filter((b) => inBucket(b.usdcSize, d));
    const closed = inB.filter((b) => b.isWin !== null);
    const wins = closed.filter((b) => b.isWin === 1).length;
    return {
      label: d.label,
      lower: d.lower,
      upper: d.upper,
      n: closed.length,
      wins,
      winRate: closed.length > 0 ? wins / closed.length : null,
    };
  });
}

export function bucketFor(
  amount: number,
  mean: number,
  stddev: number,
): BucketStats | null {
  const defs = stddevBucketDefs(mean, stddev);
  const def = defs.find((d) => inBucket(amount, d));
  if (!def) return null;
  return {
    label: def.label,
    lower: def.lower,
    upper: def.upper,
    n: 0,
    wins: 0,
    winRate: null,
  };
}
