import { computeCrossover } from "../analysis/crossover.js";
import { renderMarkdown, writeReport } from "../analysis/report.js";
import { summarizeUser } from "../analysis/summary.js";
import { config } from "../config.js";
import {
  closeDb,
  getUserByUsername,
  loadAllBets,
  loadBets,
} from "../db/storage.js";
import { logger } from "../logger.js";
import type { AnalysisReport, UserSummary } from "../types.js";

async function main(): Promise<void> {
  try {
    const summaries: UserSummary[] = [];
    for (const username of config.users) {
      const u = getUserByUsername(username);
      if (!u) {
        logger.warn({ username }, "user not in DB — run backfill first");
        continue;
      }
      const bets = loadBets(u.wallet);
      summaries.push(summarizeUser(username, u.wallet, bets));
    }

    const allBets = loadAllBets();
    const crossover = computeCrossover(allBets);

    const report: AnalysisReport = {
      generatedAt: new Date().toISOString(),
      users: summaries,
      crossover,
    };

    const { jsonPath, mdPath } = writeReport(report, "data/reports");
    logger.info({ jsonPath, mdPath }, "analysis report written");

    // Also print markdown to stdout so it's visible without opening the file.
    process.stdout.write("\n" + renderMarkdown(report) + "\n");
  } finally {
    closeDb();
  }
}

main().catch((err) => {
  logger.error({ err }, "analyze failed");
  process.exit(1);
});
