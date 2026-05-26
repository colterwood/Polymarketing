import { config } from "../config.js";
import { logger } from "../logger.js";
import { fetchMarketByTokenId } from "../api/watchMarket.js";
import { isPoliticsMarket } from "../analysis/politics.js";
import { isNewAccount } from "../analysis/newAccount.js";
import { sendAlert } from "../notify/twilio.js";
import {
  getCachedMarket,
  setCachedMarket,
  getCachedWallet,
  setCachedWallet,
} from "../db/storage.js";

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

function isDuplicate(wallet: string, conditionId: string): boolean {
  const key = `${wallet}:${conditionId}`;
  const last = recentAlerts.get(key);
  const now = Date.now();
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  // Purge stale entries
  for (const [k, t] of recentAlerts) {
    if (now - t > DEDUP_WINDOW_MS) recentAlerts.delete(k);
  }
  recentAlerts.set(key, now);
  return false;
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
    return; // Neither side is USDC — token-to-token swap, not a new buy
  }

  // 1. USDC threshold
  const usdcAmount = Number(usdcRaw) / Number(ONE_USDC);
  if (usdcAmount < config.watchMinUsdc) return;

  const assetIdStr = assetId.toString();
  const wallet = buyerWallet.toLowerCase();

  // 2. Politics market check (SQLite cache, then API)
  let cached = getCachedMarket(assetIdStr);
  if (!cached) {
    const info = await fetchMarketByTokenId(assetIdStr);
    const politics = info ? isPoliticsMarket(info.title) : false;
    setCachedMarket(assetIdStr, info, politics);
    cached = { found: !!info, info, isPolitics: politics };
  }
  if (!cached.found || !cached.isPolitics) return;

  const market = cached.info!;

  // 3. New account check (SQLite cache, then API)
  let cachedNew = getCachedWallet(wallet);
  if (cachedNew === null) {
    cachedNew = await isNewAccount(wallet, config.watchNewAccountMaxTrades);
    setCachedWallet(wallet, cachedNew);
  }
  if (!cachedNew) return;

  // 4. Dedup
  if (isDuplicate(wallet, market.conditionId)) return;

  // 5. Alert
  const shortWallet = `${wallet.slice(0, 6)}...${wallet.slice(-4)}`;
  logger.info(
    { wallet, market: market.title, usdcAmount },
    "watch alert fired",
  );
  await sendAlert({
    username: shortWallet,
    marketTitle: market.title,
    amountUsdc: usdcAmount,
    percentile: 1,
    bucketLabel: null,
    bucketWinRate: null,
    slug: market.slug,
  });
}
