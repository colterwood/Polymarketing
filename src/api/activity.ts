import { z } from "zod";
import { DATA_API } from "../config.js";
import { logger } from "../logger.js";
import type { RawActivity, Side } from "../types.js";
import { fetchJson } from "./client.js";

const PAGE_SIZE = 500;

const ActivityItem = z
  .object({
    timestamp: z.number(),
    conditionId: z.string(),
    asset: z.string(),
    outcomeIndex: z.coerce.number().int(),
    outcome: z.string().nullish(),
    type: z.string(),
    side: z.string(),
    size: z.coerce.number(),
    usdcSize: z.coerce.number(),
    price: z.coerce.number(),
    title: z.string().default(""),
    slug: z.string().default(""),
    transactionHash: z.string(),
    pseudonym: z.string().nullish(),
  })
  .passthrough();

const ActivityResponse = z.array(ActivityItem);

function toSide(s: string): Side | null {
  const up = s.toUpperCase();
  return up === "BUY" || up === "SELL" ? up : null;
}

export interface FetchActivityOptions {
  start?: number;
  end?: number;
  onPage?: (page: RawActivity[]) => void | Promise<void>;
}

export async function fetchAllTrades(
  wallet: string,
  opts: FetchActivityOptions = {},
): Promise<RawActivity[]> {
  const all: RawActivity[] = [];
  let offset = 0;
  for (;;) {
    const page = await fetchJson(`${DATA_API}/activity`, ActivityResponse, {
      query: {
        user: wallet,
        type: "TRADE",
        limit: PAGE_SIZE,
        offset,
        start: opts.start,
        end: opts.end,
      },
    });
    const trades: RawActivity[] = [];
    for (const item of page) {
      const side = toSide(item.side);
      if (!side) continue;
      trades.push({
        timestamp: item.timestamp,
        conditionId: item.conditionId,
        asset: item.asset,
        outcomeIndex: item.outcomeIndex,
        outcome: item.outcome ?? undefined,
        side,
        size: item.size,
        usdcSize: item.usdcSize,
        price: item.price,
        title: item.title ?? "",
        slug: item.slug ?? "",
        transactionHash: item.transactionHash,
        pseudonym: item.pseudonym ?? undefined,
      });
    }
    if (opts.onPage) await opts.onPage(trades);
    all.push(...trades);
    logger.debug(
      { wallet, offset, page: page.length, total: all.length },
      "activity page",
    );
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}
