import { fetchAllTrades } from "../api/activity.js";
import { fetchMarketResolutions } from "../api/markets.js";
import { resolveUsernameToWallet } from "../api/profile.js";
import { config } from "../config.js";
import {
  getKnownMarketResolutions,
  insertTrades,
  listAllConditionIds,
  loadTradesForUser,
  replaceBets,
  setSyncState,
  upsertMarketResolutions,
  upsertUser,
} from "../db/storage.js";
import { logger } from "../logger.js";
import type { Profile } from "../types.js";
import { classifyBets } from "./classify.js";

export async function backfillUser(username: string): Promise<Profile> {
  logger.info({ username }, "resolving username");
  const profile = await resolveUsernameToWallet(username);
  upsertUser(profile);
  logger.info(
    { username, wallet: profile.proxyWallet },
    "resolved, fetching trades",
  );

  let total = 0;
  await fetchAllTrades(profile.proxyWallet, {
    onPage: async (page) => {
      const inserted = insertTrades(username, profile.proxyWallet, page);
      total += inserted;
      logger.info({ username, inserted, total }, "page persisted");
    },
  });

  const trades = loadTradesForUser(profile.proxyWallet);
  if (trades.length > 0) {
    const maxTs = trades.reduce((m, t) => Math.max(m, t.timestamp), 0);
    setSyncState(profile.proxyWallet, maxTs);
  }
  logger.info({ username, totalTrades: trades.length }, "backfill done");
  return profile;
}

export async function refreshMarketResolutions(): Promise<void> {
  const known = getKnownMarketResolutions();
  const all = listAllConditionIds();
  const now = Math.floor(Date.now() / 1000);
  const weekAgo = now - 7 * 86400;

  const toFetch = all.filter((id) => {
    const k = known.get(id);
    if (!k) return true;
    if (k.closed && k.winningOutcomeIndex !== null) return false;
    if (k.resolvedAt && k.resolvedAt < weekAgo) return false;
    return true;
  });

  if (toFetch.length === 0) {
    logger.info("market resolutions already up to date");
    return;
  }

  logger.info({ count: toFetch.length }, "fetching market resolutions");
  const resolutions = await fetchMarketResolutions(toFetch);
  upsertMarketResolutions([...resolutions.values()]);
  logger.info({ count: resolutions.size }, "market resolutions persisted");
}

export function rebuildBetsForUser(wallet: string, username: string): number {
  const trades = loadTradesForUser(wallet);
  const resolutions = getKnownMarketResolutions();
  const bets = classifyBets(
    wallet,
    trades.map((t) => ({ ...t, username })),
    resolutions,
  );
  replaceBets(wallet, bets);
  return bets.length;
}

export async function runBackfill(): Promise<void> {
  for (const username of config.users) {
    await backfillUser(username);
  }
  await refreshMarketResolutions();
  for (const username of config.users) {
    const profile = await resolveUsernameToWallet(username);
    const n = rebuildBetsForUser(profile.proxyWallet, username);
    logger.info({ username, bets: n }, "bets rebuilt");
  }
}
