import type {
  BetRecord,
  ClosedVia,
  MarketResolution,
} from "../types.js";

export interface ClassifyInputTrade {
  transactionHash: string;
  timestamp: number;
  conditionId: string;
  asset: string;
  outcomeIndex: number;
  side: "BUY" | "SELL";
  size: number;
  usdcSize: number;
  price: number;
  title: string;
  slug: string;
  username: string;
}

interface OpenLot {
  buy: ClassifyInputTrade;
  remaining: number;
  sellProceeds: number;
  sellShares: number;
}

/**
 * FIFO-match BUYs with subsequent SELLs on the same (asset).
 * For each BUY, emit one BetRecord whose closedVia/realizedPnl/isWin reflects:
 *   - "sell"       if any of its shares were sold (weighted-avg of sold portion)
 *   - "resolution" if held to market resolution AND market has a winningOutcomeIndex
 *   - "open"       otherwise
 *
 * If a BUY is partially sold, we still treat it as "sell"-closed for the sold
 * portion and resolved/open for the unsold portion; the BetRecord aggregates
 * both into a single realized PnL value.
 */
export function classifyBets(
  wallet: string,
  trades: ClassifyInputTrade[],
  resolutions: Map<string, MarketResolution>,
): BetRecord[] {
  const groups = new Map<string, ClassifyInputTrade[]>();
  for (const t of trades) {
    const key = t.asset;
    const arr = groups.get(key);
    if (arr) arr.push(t);
    else groups.set(key, [t]);
  }

  const out: BetRecord[] = [];

  for (const [, group] of groups) {
    group.sort((a, b) =>
      a.timestamp !== b.timestamp
        ? a.timestamp - b.timestamp
        : a.side === "SELL"
          ? 1
          : -1,
    );

    const lots: OpenLot[] = [];
    const buyOrder: OpenLot[] = [];

    for (const t of group) {
      if (t.side === "BUY") {
        const lot: OpenLot = {
          buy: t,
          remaining: t.size,
          sellProceeds: 0,
          sellShares: 0,
        };
        lots.push(lot);
        buyOrder.push(lot);
      } else {
        let toSell = t.size;
        for (const lot of lots) {
          if (toSell <= 1e-9) break;
          if (lot.remaining <= 1e-9) continue;
          const take = Math.min(lot.remaining, toSell);
          lot.remaining -= take;
          lot.sellShares += take;
          lot.sellProceeds += take * t.price;
          toSell -= take;
        }
      }
    }

    for (const lot of buyOrder) {
      const buy = lot.buy;
      const totalShares = buy.size;
      const buyCost = buy.size * buy.price;

      const resolution =
        resolutions.get(buy.conditionId) ?? null;
      const resolvedWin =
        resolution &&
        resolution.closed &&
        resolution.winningOutcomeIndex !== null
          ? resolution.winningOutcomeIndex === buy.outcomeIndex
          : null;

      const remainingShares = lot.remaining;
      let realizedPnl = 0;
      let closedVia: ClosedVia = "open";
      let isWin: 0 | 1 | null = null;

      const soldShares = lot.sellShares;
      const sellPnl = lot.sellProceeds - soldShares * buy.price;

      if (remainingShares <= 1e-9 && soldShares > 0) {
        realizedPnl = sellPnl;
        closedVia = "sell";
        isWin = sellPnl > 0 ? 1 : 0;
      } else if (resolution && resolution.closed && resolvedWin !== null) {
        const heldPayoff = resolvedWin ? remainingShares * 1 : 0;
        const heldPnl = heldPayoff - remainingShares * buy.price;
        realizedPnl = sellPnl + heldPnl;
        closedVia = "resolution";
        if (soldShares <= 1e-9) {
          isWin = resolvedWin ? 1 : 0;
        } else {
          isWin = realizedPnl > 0 ? 1 : 0;
        }
      } else if (soldShares > 0) {
        // partially sold but market still open: treat as open (excluded from stats)
        realizedPnl = sellPnl;
        closedVia = "open";
        isWin = null;
      } else {
        realizedPnl = 0;
        closedVia = "open";
        isWin = null;
      }

      void totalShares;
      void buyCost;

      out.push({
        transactionHash: buy.transactionHash,
        userWallet: wallet,
        username: buy.username,
        timestamp: buy.timestamp,
        conditionId: buy.conditionId,
        asset: buy.asset,
        outcomeIndex: buy.outcomeIndex,
        side: "BUY",
        size: buy.size,
        usdcSize: buy.usdcSize,
        price: buy.price,
        title: buy.title,
        slug: buy.slug,
        closedVia,
        realizedPnl: closedVia === "open" ? null : realizedPnl,
        isWin,
      });
    }
  }

  out.sort((a, b) => a.timestamp - b.timestamp);
  return out;
}
