import { z } from "zod";
import { DATA_API } from "../config.js";
import { fetchJson } from "./client.js";

const MarketRow = z
  .object({
    conditionId: z.string(),
    slug: z.string().default(""),
    question: z.string().optional(),
    title: z.string().optional(),
  })
  .passthrough();

const MarketRowArray = z.array(MarketRow);

export interface WatchMarketInfo {
  conditionId: string;
  slug: string;
  title: string;
}

// In-flight request dedup: avoid parallel lookups for the same asset_id
const inflight = new Map<string, Promise<WatchMarketInfo | null>>();

export async function fetchMarketByTokenId(
  tokenId: string,
): Promise<WatchMarketInfo | null> {
  const existing = inflight.get(tokenId);
  if (existing) return existing;

  const p = (async () => {
    try {
      const rows = await fetchJson(`${DATA_API}/markets`, MarketRowArray, {
        query: { asset_id: tokenId, limit: 1 },
      });
      if (!rows.length) return null;
      const r = rows[0]!;
      const title = r.question || r.title || r.slug || "";
      return { conditionId: r.conditionId, slug: r.slug ?? "", title };
    } catch {
      return null;
    } finally {
      inflight.delete(tokenId);
    }
  })();

  inflight.set(tokenId, p);
  return p;
}
