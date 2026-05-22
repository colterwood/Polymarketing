import cron from "node-cron";
import { rankBet } from "../analysis/percentile.js";
import { summarizeUser } from "../analysis/summary.js";
import { config } from "../config.js";
import {
  getUserByUsername,
  hasAlertBeenSent,
  loadBets,
  recordAlertSent,
} from "../db/storage.js";
import { logger } from "../logger.js";
import { sendAlert } from "../notify/twilio.js";
import { pollOnce } from "../scraper/poll.js";

async function runOnce(): Promise<void> {
  logger.info("poll tick start");
  let newBuys;
  try {
    newBuys = await pollOnce();
  } catch (err) {
    logger.error({ err }, "poll failed");
    return;
  }

  if (newBuys.length === 0) {
    logger.info("no new bets");
    return;
  }

  logger.info({ count: newBuys.length }, "new bets detected");

  for (const buy of newBuys) {
    const u = getUserByUsername(buy.username);
    if (!u) continue;
    const bets = loadBets(u.wallet);
    const summary = summarizeUser(buy.username, u.wallet, bets);
    const amounts = bets.map((b) => b.usdcSize);
    const ranking = rankBet(
      buy.usdcSize,
      amounts,
      summary.buckets,
      summary.meanBetSize,
      summary.stddevBetSize,
    );

    if (ranking.percentile < config.alertPercentile) {
      logger.info(
        { username: buy.username, pct: ranking.percentile },
        "below alert threshold",
      );
      continue;
    }

    if (hasAlertBeenSent(buy.transactionHash, u.wallet, buy.asset)) {
      logger.info({ tx: buy.transactionHash }, "alert already sent");
      continue;
    }

    try {
      await sendAlert({
        username: buy.username,
        marketTitle: buy.title,
        amountUsdc: buy.usdcSize,
        percentile: ranking.percentile,
        bucketLabel: ranking.bucket?.label ?? null,
        bucketWinRate: ranking.bucket?.winRate ?? null,
        slug: buy.slug,
      });
      recordAlertSent(
        buy.transactionHash,
        u.wallet,
        buy.asset,
        ranking.percentile,
      );
    } catch (err) {
      logger.error({ err, tx: buy.transactionHash }, "SMS send failed");
    }
  }
}

function main(): void {
  if (!cron.validate(config.pollCron)) {
    throw new Error(`Invalid POLL_CRON expression: ${config.pollCron}`);
  }
  logger.info({ cron: config.pollCron }, "scheduling poll");
  void runOnce();
  cron.schedule(config.pollCron, () => {
    void runOnce();
  });
}

main();
