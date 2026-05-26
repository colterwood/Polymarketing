import { z } from "zod";
import { GAMMA_API } from "../config.js";
import { fetchJson } from "./client.js";
import { logger } from "../logger.js";

export interface PoliticsMarket {
  title: string;
  slug: string;
}

const MarketRow = z
  .object({
    question: z.string().optional().default(""),
    slug: z.string().optional().default(""),
    clobTokenIds: z.string().optional().nullable(),
  })
  .passthrough();

const EventRow = z
  .object({
    title: z.string().optional().default(""),
    slug: z.string().optional().default(""),
    markets: z.array(MarketRow).optional().default([]),
  })
  .passthrough();

const EventsResponse = z.array(EventRow);

function parseTokenIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

let tokenMap = new Map<string, PoliticsMarket>();
const REFRESH_MS = 15 * 60 * 1000;

async function fetchAllPages(): Promise<Map<string, PoliticsMarket>> {
  const map = new Map<string, PoliticsMarket>();
  let offset = 0;
  for (;;) {
    const events = await fetchJson(`${GAMMA_API}/events`, EventsResponse, {
      query: { tag_slug: "politics", limit: 100, offset, closed: false },
    });
    for (const event of events) {
      for (const market of event.markets ?? []) {
        const ids = parseTokenIds(market.clobTokenIds);
        const entry: PoliticsMarket = {
          title: market.question ?? event.title ?? "",
          slug: event.slug ?? "",
        };
        for (const id of ids) tokenMap.set(id, entry);
        for (const id of ids) map.set(id, entry);
      }
    }
    if (events.length < 100) break;
    offset += 100;
  }
  return map;
}

export async function initPoliticsCache(): Promise<void> {
  logger.info("loading politics market cache");
  tokenMap = await fetchAllPages();
  logger.info({ tokenCount: tokenMap.size }, "politics cache ready");

  setInterval(async () => {
    try {
      tokenMap = await fetchAllPages();
      logger.info({ tokenCount: tokenMap.size }, "politics cache refreshed");
    } catch (err) {
      logger.warn({ err }, "politics cache refresh failed, keeping stale data");
    }
  }, REFRESH_MS);
}

export function getPoliticsMarket(tokenId: string): PoliticsMarket | null {
  return tokenMap.get(tokenId) ?? null;
}
