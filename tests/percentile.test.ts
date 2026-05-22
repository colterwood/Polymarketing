import { describe, expect, it } from "vitest";
import { bucketizeBets } from "../src/analysis/buckets.js";
import { rankBet } from "../src/analysis/percentile.js";
import type { BetRecord } from "../src/types.js";

function bet(usdcSize: number, isWin: 0 | 1 | null, i: number): BetRecord {
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

describe("rankBet", () => {
  it("returns percentile and matching bucket for an above-mean bet", () => {
    const bets: BetRecord[] = [];
    for (let i = 0; i < 100; i++) {
      const win = (i % 3 === 0 ? 1 : 0) as 0 | 1;
      bets.push(bet(i + 1, win, i));
    }
    const amounts = bets.map((b) => b.usdcSize);
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance =
      amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / (amounts.length - 1);
    const stddev = Math.sqrt(variance);
    const buckets = bucketizeBets(bets, mean, stddev);

    const result = rankBet(200, amounts, buckets, mean, stddev);
    expect(result.percentile).toBeGreaterThan(0.95);
    expect(result.bucket?.label).toBe("> μ+2σ");
  });
});
