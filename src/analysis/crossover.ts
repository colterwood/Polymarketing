import type { BetRecord, CrossoverMarket, CrossoverReport } from "../types.js";

function aggregateByConditionUser(bets: BetRecord[]): Map<
  string,
  Map<
    string,
    {
      outcomeIndex: number;
      totalUsdc: number;
      firstTimestamp: number;
      lastTimestamp: number;
      nTrades: number;
      title: string;
      slug: string;
    }
  >
> {
  const out = new Map<
    string,
    Map<
      string,
      {
        outcomeIndex: number;
        totalUsdc: number;
        firstTimestamp: number;
        lastTimestamp: number;
        nTrades: number;
        title: string;
        slug: string;
      }
    >
  >();
  for (const b of bets) {
    let perUser = out.get(b.conditionId);
    if (!perUser) {
      perUser = new Map();
      out.set(b.conditionId, perUser);
    }
    const key = `${b.username}|${b.outcomeIndex}`;
    const ex = perUser.get(key);
    if (ex) {
      ex.totalUsdc += b.usdcSize;
      ex.firstTimestamp = Math.min(ex.firstTimestamp, b.timestamp);
      ex.lastTimestamp = Math.max(ex.lastTimestamp, b.timestamp);
      ex.nTrades += 1;
    } else {
      perUser.set(key, {
        outcomeIndex: b.outcomeIndex,
        totalUsdc: b.usdcSize,
        firstTimestamp: b.timestamp,
        lastTimestamp: b.timestamp,
        nTrades: 1,
        title: b.title,
        slug: b.slug,
      });
    }
  }
  return out;
}

export function computeCrossover(allBets: BetRecord[]): CrossoverReport {
  const grouped = aggregateByConditionUser(allBets);
  const sameSide: CrossoverMarket[] = [];
  const oppositeSide: CrossoverMarket[] = [];

  for (const [conditionId, perUser] of grouped) {
    const entries = [...perUser.entries()].map(([k, v]) => ({
      username: k.split("|")[0]!,
      ...v,
    }));
    const usernames = new Set(entries.map((e) => e.username));
    if (usernames.size < 2) continue;

    const outcomes = new Set(entries.map((e) => e.outcomeIndex));
    const isSameSide = outcomes.size === 1;

    const market: CrossoverMarket = {
      conditionId,
      title: entries[0]!.title,
      slug: entries[0]!.slug,
      sameSide: isSameSide,
      users: entries.map((e) => ({
        username: e.username,
        outcomeIndex: e.outcomeIndex,
        totalUsdc: e.totalUsdc,
        firstTimestamp: e.firstTimestamp,
        lastTimestamp: e.lastTimestamp,
        nTrades: e.nTrades,
      })),
    };
    if (isSameSide) sameSide.push(market);
    else oppositeSide.push(market);
  }

  sameSide.sort((a, b) => b.users[0]!.lastTimestamp - a.users[0]!.lastTimestamp);
  oppositeSide.sort(
    (a, b) => b.users[0]!.lastTimestamp - a.users[0]!.lastTimestamp,
  );

  return {
    sameSideCount: sameSide.length,
    oppositeSideCount: oppositeSide.length,
    sameSide,
    oppositeSide,
  };
}
