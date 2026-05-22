import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  POLYMARKET_USERS: z.string().default("magamyman,whopperlover"),
  DB_PATH: z.string().default("data/polymarket.db"),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),
  ALERT_TO_NUMBER: z.string().optional(),
  ALERT_PERCENTILE: z.coerce.number().min(0).max(1).default(0.9),
  POLL_CRON: z.string().default("*/30 * * * *"),
  HTTP_MAX_RETRIES: z.coerce.number().int().min(0).default(5),
  HTTP_RPS_LIMIT: z.coerce.number().positive().default(5),
  DRY_RUN: z
    .string()
    .default("false")
    .transform((v) => v.toLowerCase() === "true"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error"])
    .default("info"),
});

const parsed = Env.parse(process.env);

export const config = {
  users: parsed.POLYMARKET_USERS.split(",")
    .map((u) => u.trim())
    .filter(Boolean),
  dbPath: parsed.DB_PATH,
  twilio: {
    sid: parsed.TWILIO_ACCOUNT_SID,
    token: parsed.TWILIO_AUTH_TOKEN,
    from: parsed.TWILIO_FROM_NUMBER,
    to: parsed.ALERT_TO_NUMBER,
  },
  alertPercentile: parsed.ALERT_PERCENTILE,
  pollCron: parsed.POLL_CRON,
  http: {
    maxRetries: parsed.HTTP_MAX_RETRIES,
    rpsLimit: parsed.HTTP_RPS_LIMIT,
  },
  dryRun: parsed.DRY_RUN,
  logLevel: parsed.LOG_LEVEL,
} as const;

export const GAMMA_API = "https://gamma-api.polymarket.com";
export const DATA_API = "https://data-api.polymarket.com";
export const MARKET_URL = (slug: string) =>
  `https://polymarket.com/event/${slug}`;
