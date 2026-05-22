import { describe, expect, it } from "vitest";
import { bucketFor, bucketizeBets } from "../src/analysis/buckets.js";
import type { BetRecord } from "../src/types.js";

function bet(
  usdcSize: number,
  isWin: 0 | 1 | null,
  i: number,
): BetRecord {
  return {
    transactionHash: `0x${i}`,
    userWallet: "0xw",
    username: "u",
    timestamp: i,
    conditionId: `c${i}`,
    asset: `a${i}`,
    outcomeIndex: 0,
    side: "BUY",
    size: usdcSize * 2,
    usdcSize,
    price: 0.5,
    title: "",
    slug: "",
    closedVia: isWin === null ? "open" : "sell",
    realizedPnl: null,
    isWin,
  };
}

describe("bucketizeBets", () => {
  it("partitions bets into stddev tiers and computes per-tier win rate", () => {
    const mean = 100;
    const stddev = 50;
    const bets: BetRecord[] = [
      bet(10, 1, 1), // ≤ μ-2σ (≤0): no, 10 > 0, so (μ-2σ, μ-σ] = (0,50]
      bet(20, 0, 2),
      bet(60, 1, 3), // (μ-σ, μ]
      bet(80, 1, 4),
      bet(110, 0, 5), // (μ, μ+σ]
      bet(120, 1, 6),
      bet(160, 1, 7), // (μ+σ, μ+2σ]
      bet(250, 0, 8), // > μ+2σ
      bet(300, null, 9), // open, excluded
    ];
    const buckets = bucketizeBets(bets, mean, stddev);
    const find = (label: string) => buckets.find((b) => b.label === label)!;
    expect(find("(μ−2σ, μ−σ]").n).toBe(2);
    expect(find("(μ−2σ, μ−σ]").wins).toBe(1);
    expect(find("(μ−σ, μ]").n).toBe(2);
    expect(find("(μ−σ, μ]").winRate).toBe(1);
    expect(find("(μ, μ+σ]").n).toBe(2);
    expect(find("(μ, μ+σ]").winRate).toBe(0.5);
    expect(find("(μ+σ, μ+2σ]").n).toBe(1);
    expect(find("> μ+2σ").n).toBe(1);
    expect(find("> μ+2σ").wins).toBe(0);
  });

  it("bucketFor picks the right bucket for an amount", () => {
    const b = bucketFor(175, 100, 50);
    expect(b?.label).toBe("(μ+σ, μ+2σ]");
    const top = bucketFor(500, 100, 50);
    expect(top?.label).toBe("> μ+2σ");
  });
});
