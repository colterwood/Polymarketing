import twilio from "twilio";
import { MARKET_URL, config } from "../config.js";
import { logger } from "../logger.js";

export interface AlertPayload {
  username: string;
  marketTitle: string;
  amountUsdc: number;
  percentile: number; // 0..1
  bucketLabel: string | null;
  bucketWinRate: number | null;
  slug: string;
}

function formatBody(p: AlertPayload): string {
  const pct = (p.percentile * 100).toFixed(1);
  const amt = `$${p.amountUsdc.toFixed(2)}`;
  const wr =
    p.bucketWinRate !== null
      ? `${(p.bucketWinRate * 100).toFixed(0)}% hist win rate`
      : "no historical win rate";
  const tier = p.bucketLabel ? ` (${p.bucketLabel})` : "";
  return `${p.username} bet ${amt} on "${p.marketTitle}" — ${pct}th percentile size${tier}, ${wr}. ${MARKET_URL(p.slug)}`;
}

export async function sendAlert(payload: AlertPayload): Promise<void> {
  const body = formatBody(payload);

  if (config.dryRun) {
    logger.info({ payload, body }, "[DRY_RUN] would send SMS");
    return;
  }

  if (
    !config.twilio.sid ||
    !config.twilio.token ||
    !config.twilio.from ||
    !config.twilio.to
  ) {
    logger.warn(
      "Twilio credentials missing; logging alert instead of sending",
    );
    logger.info({ body }, "ALERT");
    return;
  }

  const client = twilio(config.twilio.sid, config.twilio.token);
  const msg = await client.messages.create({
    body,
    from: config.twilio.from,
    to: config.twilio.to,
  });
  logger.info({ sid: msg.sid, to: config.twilio.to }, "SMS sent");
}
