import { z } from "zod";
import { DATA_API } from "../config.js";
import { fetchJson } from "../api/client.js";
import { logger } from "../logger.js";

const ActivityPage = z
  .array(z.object({ timestamp: z.number() }).passthrough());

const MS_PER_DAY = 86_400_000;

// Returns true if the wallet's first Polymarket trade is within maxAgeDays.
// Wallets with zero prior trades are also considered new.
// Conservative: returns false on API error to avoid false alerts.
export async function isNewAccount(
  wallet: string,
  maxAgeDays: number,
): Promise<boolean> {
  try {
    const page = await fetchJson(`${DATA_API}/activity`, ActivityPage, {
      query: {
        user: wallet,
        type: "TRADE",
        limit: 1,
        offset: 0,
        sortBy: "TIMESTAMP",
        order: "ASC",
      },
    });

    if (page.length === 0) {
      // This bet is their very first — definitely new
      return true;
    }

    const firstTradeMs = page[0]!.timestamp * 1000;
    const ageDays = (Date.now() - firstTradeMs) / MS_PER_DAY;
    return ageDays <= maxAgeDays;
  } catch (err) {
    logger.warn({ wallet, err }, "account age check failed, treating as established");
    return false;
  }
}
