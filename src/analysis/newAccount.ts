import { z } from "zod";
import { DATA_API } from "../config.js";
import { fetchJson } from "../api/client.js";
import { logger } from "../logger.js";

const TradesPage = z.array(z.object({}).passthrough());

// Returns true if the wallet has fewer than maxTrades trades on Polymarket.
// Conservative: returns false (not new) on API error.
export async function isNewAccount(
  wallet: string,
  maxTrades: number,
): Promise<boolean> {
  try {
    const page = await fetchJson(`${DATA_API}/activity`, TradesPage, {
      query: { user: wallet, type: "TRADE", limit: maxTrades, offset: 0 },
    });
    return page.length < maxTrades;
  } catch (err) {
    logger.warn({ wallet, err }, "newAccount check failed, assuming established");
    return false;
  }
}
