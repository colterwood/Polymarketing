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
  body?: string; // override the generated message body
}

function formatBody(p: AlertPayload): string {
  const shortSlug = p.slug.split("-").slice(0, 6).join("-");
  const url = MARKET_URL(shortSlug);
  return `see position from ${p.username} on ${p.marketTitle} here: ${url}`;
}

export async function sendAlert(payload: AlertPayload): Promise<void> {
  const body = payload.body ?? formatBody(payload);

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
