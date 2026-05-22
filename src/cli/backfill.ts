import { closeDb } from "../db/storage.js";
import { logger } from "../logger.js";
import { runBackfill } from "../scraper/backfill.js";

async function main(): Promise<void> {
  try {
    await runBackfill();
    logger.info("backfill complete");
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  logger.error({ err }, "backfill failed");
  process.exit(1);
});
