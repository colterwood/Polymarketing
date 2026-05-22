import { describe, expect, it } from "vitest";
import { classifyBets, type ClassifyInputTrade } from "../src/scraper/classify.js";
import type { MarketResolution } from "../src/types.js";

function buy(
  partial: Partial<ClassifyInputTrade> & {
    timestamp: number;
    size: number;
    price: number;
  },
): ClassifyInputTrade {
  return {
    transactionHash: `0xbuy-${partial.timestamp}-${partial.size}`,
    conditionId: partial.conditionId ?? "C1",
    asset: partial.asset ?? "ASSET-YES",
    outcomeIndex: partial.outcomeIndex ?? 0,
    side: "BUY",
    size: partial.size,
    usdcSize: partial.size * partial.price,
    price: partial.price,
    title: partial.title ?? "Test market",
    slug: partial.slug ?? "test-market",
    username: partial.username ?? "alice",
    timestamp: partial.timestamp,
  };
}

function sell(
  partial: Partial<ClassifyInputTrade> & {
    timestamp: number;
    size: number;
    price: number;
  },
): ClassifyInputTrade {
  return {
    ...buy(partial),
    transactionHash: `0xsell-${partial.timestamp}-${partial.size}`,
    side: "SELL",
  };
}

const noResolutions = new Map<string, MarketResolution>();

describe("classifyBets", () => {
  it("marks fully-sold profitable buy as win=1 via sell", () => {
    const bets = classifyBets(
      "0xwallet",
      [
        buy({ timestamp: 1, size: 100, price: 0.4 }),
        sell({ timestamp: 2, size: 100, price: 0.6 }),
      ],
      noResolutions,
    );
    expect(bets).toHaveLength(1);
    expect(bets[0]!.closedVia).toBe("sell");
    expect(bets[0]!.isWin).toBe(1);
    expect(bets[0]!.realizedPnl).toBeCloseTo(100 * 0.6 - 100 * 0.4, 6);
  });

  it("marks fully-sold losing buy as win=0", () => {
    const bets = classifyBets(
      "0xwallet",
      [
        buy({ timestamp: 1, size: 100, price: 0.6 }),
        sell({ timestamp: 2, size: 100, price: 0.4 }),
      ],
      noResolutions,
    );
    expect(bets[0]!.isWin).toBe(0);
    expect(bets[0]!.realizedPnl).toBeLessThan(0);
  });

  it("FIFO splits sells across multiple buys", () => {
    const bets = classifyBets(
      "0xwallet",
      [
        buy({ timestamp: 1, size: 100, price: 0.5 }),
        buy({ timestamp: 2, size: 100, price: 0.6 }),
        sell({ timestamp: 3, size: 150, price: 0.7 }),
      ],
      noResolutions,
    );
    expect(bets).toHaveLength(2);
    // first buy fully sold at 0.7 → 100 * (0.7 - 0.5) = +20
    expect(bets[0]!.closedVia).toBe("sell");
    expect(bets[0]!.realizedPnl).toBeCloseTo(20, 6);
    expect(bets[0]!.isWin).toBe(1);
    // second buy partially sold (50 of 100), market open → "open"
    expect(bets[1]!.closedVia).toBe("open");
    expect(bets[1]!.isWin).toBeNull();
  });

  it("uses market resolution for held-to-resolution buys", () => {
    const resolutions = new Map<string, MarketResolution>([
      [
        "C1",
        {
          conditionId: "C1",
          closed: true,
          winningOutcomeIndex: 0,
          resolvedAt: 5,
        },
      ],
    ]);
    const bets = classifyBets(
      "0xwallet",
      [buy({ timestamp: 1, size: 100, price: 0.3 })],
      resolutions,
    );
    expect(bets[0]!.closedVia).toBe("resolution");
    expect(bets[0]!.isWin).toBe(1);
    expect(bets[0]!.realizedPnl).toBeCloseTo(100 - 100 * 0.3, 6);
  });

  it("losing held-to-resolution buy is win=0", () => {
    const resolutions = new Map<string, MarketResolution>([
      [
        "C1",
        {
          conditionId: "C1",
          closed: true,
          winningOutcomeIndex: 1,
          resolvedAt: 5,
        },
      ],
    ]);
    const bets = classifyBets(
      "0xwallet",
      [buy({ timestamp: 1, size: 100, price: 0.4, outcomeIndex: 0 })],
      resolutions,
    );
    expect(bets[0]!.closedVia).toBe("resolution");
    expect(bets[0]!.isWin).toBe(0);
  });

  it("buy in unresolved market with no sells is open", () => {
    const bets = classifyBets(
      "0xwallet",
      [buy({ timestamp: 1, size: 100, price: 0.5 })],
      noResolutions,
    );
    expect(bets[0]!.closedVia).toBe("open");
    expect(bets[0]!.isWin).toBeNull();
  });
});
