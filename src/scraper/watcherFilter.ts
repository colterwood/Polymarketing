import { config } from "../config.js";
import { logger } from "../logger.js";
import { getPoliticsMarket } from "../api/politicsCache.js";
import { isNewAccount } from "../analysis/newAccount.js";
import { sendAlert } from "../notify/twilio.js";
import { getCachedWallet, setCachedWallet } from "../db/storage.js";
import { MARKET_URL } from "../config.js";

export interface OrderFilledEvent {
  txHash: string;
  maker: `0x${string}`;
  taker: `0x${string}`;
  makerAssetId: bigint;
  takerAssetId: bigint;
  makerAmountFilled: bigint;
  takerAmountFilled: bigint;
}

const ONE_USDC = 10n ** 6n;

// Dedup: don't re-alert same wallet+market within 1 hour
const recentAlerts = new Map<string, number>();
const DEDUP_WINDOW_MS = 60 * 60 * 1000;

function isDuplicate(wallet: string, slug: string): boolean {
  const key = `${wallet}:${slug}`;
  const last = recentAlerts.get(key);
  const now = Date.now();
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  for (const [k, t] of recentAlerts) {
    if (now - t > DEDUP_WINDOW_MS) recentAlerts.delete(k);
  }
  recentAlerts.set(key, now);
  return false;
}

function formatUsdcAmount(amount: number): string {
  return "$" + Math.round(amount).toLocaleString("en-US");
}

export async function handleOrderFilled(e: OrderFilledEvent): Promise<void> {
  // Determine which side is paying USDC (asset ID 0)
  let buyerWallet: string;
  let usdcRaw: bigint;
  let assetId: bigint;

  if (e.makerAssetId === 0n) {
    buyerWallet = e.maker;
    usdcRaw = e.makerAmountFilled;
    assetId = e.takerAssetId;
  } else if (e.takerAssetId === 0n) {
    buyerWallet = e.taker;
    usdcRaw = e.takerAmountFilled;
    assetId = e.makerAssetId;
  } else {
    return; // Neither side is USDC
  }

  // 1. USDC threshold
  const usdcAmount = Number(usdcRaw) / Number(ONE_USDC);
  if (usdcAmount < config.watchMinUsdc) return;

  // 2. Politics market check (in-memory pre-loaded cache)
  const market = getPoliticsMarket(assetId.toString());
  if (!market) return;

  // 3. New account check (SQLite cache, then API)
  const wallet = buyerWallet.toLowerCase();
  let cachedNew = getCachedWallet(wallet);
  if (cachedNew === null) {
    cachedNew = await isNewAccount(wallet, config.watchNewAccountMaxAgeDays);
    setCachedWallet(wallet, cachedNew);
  }
  if (!cachedNew) return;

  // 4. Dedup
  if (isDuplicate(wallet, market.slug)) return;

  // 5. Alert
  const amountStr = formatUsdcAmount(usdcAmount);
  const url = MARKET_URL(market.slug);
  const body = `A new account has placed a ${amountStr} wager on ${market.title}:\n\n${url}`;

  logger.info({ wallet, market: market.title, usdcAmount }, "watch alert fired");
  await sendAlert({
    username: wallet,
    marketTitle: market.title,
    amountUsdc: usdcAmount,
    percentile: 1,
    bucketLabel: null,
    bucketWinRate: null,
    slug: market.slug,
    body,
  });
}
