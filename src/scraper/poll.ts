import { fetchAllTrades } from "../api/activity.js";
import { resolveUsernameToWallet } from "../api/profile.js";
import { config } from "../config.js";
import {
  getLatestTradeTimestamp,
  getUserByUsername,
  insertTrades,
  loadTradesForUser,
  setSyncState,
  upsertUser,
} from "../db/storage.js";
import { logger } from "../logger.js";
import type { RawActivity } from "../types.js";
import {
  rebuildBetsForUser,
  refreshMarketResolutions,
} from "./backfill.js";

const OVERLAP_SECONDS = 60;

export interface NewBuyTrade extends RawActivity {
  username: string;
  wallet: string;
}

async function getOrResolveWallet(
  username: string,
): Promise<{ username: string; wallet: string }> {
  const cached = getUserByUsername(username);
  if (cached) return cached;
  const profile = await resolveUsernameToWallet(username);
  upsertUser(profile);
  return { username, wallet: profile.proxyWallet };
}

export async function pollOnce(): Promise<NewBuyTrade[]> {
  const newBuys: NewBuyTrade[] = [];

  for (const username of config.users) {
    const { wallet } = await getOrResolveWallet(username);
    const latestTs = getLatestTradeTimestamp(wallet);
    const start =
      latestTs !== null ? Math.max(0, latestTs - OVERLAP_SECONDS) : undefined;

    logger.info({ username, wallet, start }, "polling for new trades");

    const fetched = await fetchAllTrades(wallet, start !== undefined ? { start } : {});

    const inserted = insertTrades(username, wallet, fetched);

    if (fetched.length > 0) {
      const maxTs = fetched.reduce((m, t) => Math.max(m, t.timestamp), 0);
      setSyncState(wallet, maxTs);
    }

    logger.info(
      { username, fetched: fetched.length, inserted },
      "poll page complete",
    );

    if (inserted > 0) {
      const knownHashes = new Set(
        loadTradesForUser(wallet)
          .filter(
            (t) =>
              latestTs === null ||
              t.timestamp > latestTs ||
              (t.timestamp === latestTs && t.side === "BUY"),
          )
          .map((t) => `${t.transactionHash}:${t.asset}`),
      );
      for (const t of fetched) {
        if (t.side !== "BUY") continue;
        if (latestTs !== null && t.timestamp <= latestTs) continue;
        const key = `${t.transactionHash}:${t.asset}`;
        if (!knownHashes.has(key)) continue;
        newBuys.push({ ...t, username, wallet });
      }
    }
  }

  if (newBuys.length > 0) {
    await refreshMarketResolutions();
    for (const username of config.users) {
      const { wallet } = await getOrResolveWallet(username);
      rebuildBetsForUser(wallet, username);
    }
  }

  return newBuys;
}
