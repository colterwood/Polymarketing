import { getDb, closeDb } from "../db/storage.js";
import { startChainListener } from "../chain/listener.js";
import { logger } from "../logger.js";
import { config } from "../config.js";

async function main() {
  logger.info(
    {
      minUsdc: config.watchMinUsdc,
      maxTrades: config.watchNewAccountMaxTrades,
      wsUrl: config.polygonWsUrl,
    },
    "watch starting",
  );

  getDb(); // init DB / run migrations

  const unwatch = startChainListener();

  const shutdown = (signal: string) => {
    logger.info({ signal }, "shutting down watch");
    unwatch();
    closeDb();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Keep the process alive
  await new Promise(() => {});
}

main().catch((err) => {
  logger.error({ err }, "watch crashed");
  process.exit(1);
});
