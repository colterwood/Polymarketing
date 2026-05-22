import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AnalysisReport, UserSummary } from "../types.js";

function fmt(n: number | null, digits = 2): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return n.toFixed(digits);
}

function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return (n * 100).toFixed(1) + "%";
}

function fmtUsd(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return "$" + n.toFixed(2);
}

function renderUser(u: UserSummary): string {
  const head = `## ${u.username} (\`${u.wallet}\`)

- Total BUY trades: **${u.totalBets}** (closed: ${u.closedBets}, open: ${u.openBets})
- Mean bet size: **${fmtUsd(u.meanBetSize)}**  ·  Stddev: **${fmtUsd(u.stddevBetSize)}**  ·  Median: ${fmtUsd(u.medianBetSize)}
- Bet-size skewness: ${fmt(u.skewness)}  ·  Excess kurtosis: ${fmt(u.kurtosis)}
- Overall win rate: **${fmtPct(u.overallWinRate)}**
- Distribution shape: **${u.shape.classification}** · win-rate-vs-size trend: ${u.shape.monotone}
`;

  const buckets =
    u.buckets.length === 0
      ? "_No bucket stats — too few bets or zero stddev._"
      : [
          "| Bucket | Lower | Upper | n (closed) | wins | win rate |",
          "|---|---|---|---:|---:|---:|",
          ...u.buckets.map(
            (b) =>
              `| ${b.label} | ${fmtUsd(b.lower)} | ${fmtUsd(b.upper)} | ${b.n} | ${b.wins} | ${fmtPct(b.winRate)} |`,
          ),
        ].join("\n");

  return head + "\n" + buckets + "\n";
}

export function renderMarkdown(report: AnalysisReport): string {
  const lines: string[] = [];
  lines.push(`# Polymarket Bet Analysis`);
  lines.push(`_Generated ${report.generatedAt}_`);
  lines.push("");
  for (const u of report.users) {
    lines.push(renderUser(u));
  }
  lines.push(`## Crossover markets`);
  lines.push("");
  lines.push(
    `- Markets where both users bet on the **same side**: **${report.crossover.sameSideCount}**`,
  );
  lines.push(
    `- Markets where they bet on **opposite sides**: **${report.crossover.oppositeSideCount}**`,
  );
  lines.push("");

  for (const [label, list] of [
    ["Same-side overlap", report.crossover.sameSide],
    ["Opposite-side overlap", report.crossover.oppositeSide],
  ] as const) {
    lines.push(`### ${label}`);
    if (list.length === 0) {
      lines.push("_None._");
      lines.push("");
      continue;
    }
    lines.push("| Market | Outcomes per user |");
    lines.push("|---|---|");
    for (const m of list.slice(0, 50)) {
      const desc = m.users
        .map(
          (u) =>
            `${u.username}→#${u.outcomeIndex} (${fmtUsd(u.totalUsdc)} over ${u.nTrades} trades)`,
        )
        .join(" · ");
      lines.push(`| [${m.title}](https://polymarket.com/event/${m.slug}) | ${desc} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function writeReport(report: AnalysisReport, baseDir: string): {
  jsonPath: string;
  mdPath: string;
} {
  const ts = report.generatedAt.replace(/[:.]/g, "-");
  const jsonPath = join(baseDir, `report-${ts}.json`);
  const mdPath = join(baseDir, `report-${ts}.md`);
  mkdirSync(dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, renderMarkdown(report));
  return { jsonPath, mdPath };
}
