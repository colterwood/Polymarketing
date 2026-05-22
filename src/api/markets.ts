import { z } from "zod";
import { GAMMA_API } from "../config.js";
import type { MarketResolution } from "../types.js";
import { fetchJson } from "./client.js";

const Market = z
  .object({
    conditionId: z.string(),
    slug: z.string().nullish(),
    closed: z.boolean().nullish(),
    closedTime: z.string().nullish(),
    endDate: z.string().nullish(),
    outcomePrices: z.string().nullish(),
  })
  .passthrough();

const MarketsResponse = z.array(Market);

function parsePrices(raw: string | null | undefined): number[] | null {
  if (!raw) return null;
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return null;
    return arr.map((x) => Number(x));
  } catch {
    return null;
  }
}

function isoToEpoch(s: string | null | undefined): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

export async function fetchMarketResolutions(
  conditionIds: string[],
): Promise<Map<string, MarketResolution>> {
  const out = new Map<string, MarketResolution>();
  const unique = [...new Set(conditionIds)];
  const CHUNK = 50;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const data = await fetchJson(`${GAMMA_API}/markets`, MarketsResponse, {
      query: { condition_ids: chunk.join(","), limit: CHUNK },
    });
    for (const m of data) {
      const prices = parsePrices(m.outcomePrices);
      let winningIdx: number | null = null;
      if (m.closed && prices && prices.length > 0) {
        let best = -Infinity;
        prices.forEach((p, idx) => {
          if (p > best) {
            best = p;
            winningIdx = idx;
          }
        });
        // Only count as resolved if a single outcome is at $1 (or close).
        if (best < 0.99) winningIdx = null;
      }
      out.set(m.conditionId, {
        conditionId: m.conditionId,
        slug: m.slug ?? undefined,
        closed: !!m.closed,
        winningOutcomeIndex: winningIdx,
        resolvedAt: isoToEpoch(m.closedTime ?? m.endDate),
      });
    }
  }
  return out;
}
