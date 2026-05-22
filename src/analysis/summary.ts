import {
  mean,
  median,
  sampleSkewness,
  sampleStandardDeviation,
} from "simple-statistics";
import type { BetRecord, UserSummary } from "../types.js";
import { bucketizeBets } from "./buckets.js";

function sampleKurtosis(values: number[]): number {
  if (values.length < 4) return 0;
  const n = values.length;
  const m = mean(values);
  const s = sampleStandardDeviation(values);
  if (s === 0) return 0;
  const sum = values.reduce((acc, v) => acc + ((v - m) / s) ** 4, 0);
  return (
    ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sum -
    (3 * (n - 1) ** 2) / ((n - 2) * (n - 3))
  );
}

function classifyShape(opts: {
  sizeSkewness: number;
  sizeKurtosis: number;
  winRateVsSizeSkew: number;
}): UserSummary["shape"]["classification"] {
  if (Math.abs(opts.sizeKurtosis) > 3) return "heavy_tail";
  if (opts.sizeSkewness > 1) return "right_skew";
  if (opts.sizeSkewness < -1) return "left_skew";
  return "approx_normal";
}

function monotone(values: Array<number | null>): "increasing" | "decreasing" | "mixed" {
  const real = values.filter((v): v is number => v !== null);
  if (real.length < 2) return "mixed";
  let inc = true;
  let dec = true;
  for (let i = 1; i < real.length; i++) {
    if (real[i]! < real[i - 1]!) inc = false;
    if (real[i]! > real[i - 1]!) dec = false;
  }
  if (inc) return "increasing";
  if (dec) return "decreasing";
  return "mixed";
}

export function summarizeUser(
  username: string,
  wallet: string,
  bets: BetRecord[],
): UserSummary {
  const buyAmounts = bets.map((b) => b.usdcSize);
  const closed = bets.filter((b) => b.isWin !== null);
  const open = bets.length - closed.length;
  const wins = closed.filter((b) => b.isWin === 1).length;

  if (buyAmounts.length === 0) {
    return {
      username,
      wallet,
      totalBets: 0,
      closedBets: 0,
      openBets: 0,
      meanBetSize: 0,
      stddevBetSize: 0,
      medianBetSize: 0,
      skewness: 0,
      kurtosis: 0,
      overallWinRate: null,
      buckets: [],
      shape: {
        sizeSkewness: 0,
        sizeKurtosis: 0,
        winRateVsSizeSkew: 0,
        monotone: "mixed",
        classification: "approx_normal",
      },
    };
  }

  const m = mean(buyAmounts);
  const sd =
    buyAmounts.length > 1 ? sampleStandardDeviation(buyAmounts) : 0;
  const sk = buyAmounts.length > 2 ? sampleSkewness(buyAmounts) : 0;
  const ku = sampleKurtosis(buyAmounts);

  const buckets = sd > 0 ? bucketizeBets(bets, m, sd) : [];
  const winRateSeries = buckets.map((b) => b.winRate);
  const finiteRates = winRateSeries.filter((v): v is number => v !== null);
  const winRateVsSizeSkew =
    finiteRates.length > 2 ? sampleSkewness(finiteRates) : 0;

  return {
    username,
    wallet,
    totalBets: bets.length,
    closedBets: closed.length,
    openBets: open,
    meanBetSize: m,
    stddevBetSize: sd,
    medianBetSize: median(buyAmounts),
    skewness: sk,
    kurtosis: ku,
    overallWinRate: closed.length > 0 ? wins / closed.length : null,
    buckets,
    shape: {
      sizeSkewness: sk,
      sizeKurtosis: ku,
      winRateVsSizeSkew,
      monotone: monotone(winRateSeries),
      classification: classifyShape({
        sizeSkewness: sk,
        sizeKurtosis: ku,
        winRateVsSizeSkew,
      }),
    },
  };
}
