import { describe, expect, it } from "vitest";
import { computeCrossover } from "../src/analysis/crossover.js";
import type { BetRecord } from "../src/types.js";

function bet(
  username: string,
  conditionId: string,
  outcomeIndex: number,
  usdcSize: number,
  i: number,
): BetRecord {
  return {
    transactionHash: `0x${username}-${i}`,
    userWallet: `0x${username}`,
    username,
    timestamp: i,
    conditionId,
    asset: `${conditionId}-${outcomeIndex}`,
    outcomeIndex,
    side: "BUY",
    size: usdcSize * 2,
    usdcSize,
    price: 0.5,
    title: `T-${conditionId}`,
    slug: `s-${conditionId}`,
    closedVia: "open",
    realizedPnl: null,
    isWin: null,
  };
}

describe("computeCrossover", () => {
  it("classifies same-side and opposite-side overlap correctly", () => {
    const bets: BetRecord[] = [
      // shared market C1, both on outcome 0 → same side
      bet("alice", "C1", 0, 100, 1),
      bet("bob", "C1", 0, 50, 2),
      // shared market C2, alice on 0, bob on 1 → opposite
      bet("alice", "C2", 0, 30, 3),
      bet("bob", "C2", 1, 70, 4),
      // only one user → not crossover
      bet("alice", "C3", 0, 10, 5),
    ];
    const r = computeCrossover(bets);
    expect(r.sameSideCount).toBe(1);
    expect(r.oppositeSideCount).toBe(1);
    expect(r.sameSide[0]!.conditionId).toBe("C1");
    expect(r.oppositeSide[0]!.conditionId).toBe("C2");
    const aliceC1 = r.sameSide[0]!.users.find((u) => u.username === "alice")!;
    expect(aliceC1.totalUsdc).toBe(100);
    expect(aliceC1.outcomeIndex).toBe(0);
  });
});
