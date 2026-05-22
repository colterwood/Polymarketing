import Database from "better-sqlite3";
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import type {
  BetRecord,
  MarketResolution,
  Profile,
  RawActivity,
} from "../types.js";

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(here, "schema.sql");

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  mkdirSync(dirname(config.dbPath), { recursive: true });
  const db = new Database(config.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  dbInstance = db;
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function upsertUser(p: Profile): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO users (username, wallet, pseudonym, name, bio, updated_at)
     VALUES (@username, @wallet, @pseudonym, @name, @bio, @updated_at)
     ON CONFLICT(username) DO UPDATE SET
       wallet = excluded.wallet,
       pseudonym = excluded.pseudonym,
       name = excluded.name,
       bio = excluded.bio,
       updated_at = excluded.updated_at`,
  ).run({
    username: p.username,
    wallet: p.proxyWallet,
    pseudonym: p.pseudonym ?? null,
    name: p.name ?? null,
    bio: p.bio ?? null,
    updated_at: Math.floor(Date.now() / 1000),
  });
}

export function getUserByUsername(
  username: string,
): { username: string; wallet: string } | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT username, wallet FROM users WHERE username = ?`)
    .get(username) as { username: string; wallet: string } | undefined;
  return row ?? null;
}

const insertTradeStmt = `
  INSERT OR IGNORE INTO trades (
    transaction_hash, user_wallet, username, timestamp, condition_id, asset,
    outcome_index, side, size, usdc_size, price, title, slug
  ) VALUES (
    @transaction_hash, @user_wallet, @username, @timestamp, @condition_id, @asset,
    @outcome_index, @side, @size, @usdc_size, @price, @title, @slug
  )`;

export function insertTrades(
  username: string,
  wallet: string,
  trades: RawActivity[],
): number {
  if (trades.length === 0) return 0;
  const db = getDb();
  const stmt = db.prepare(insertTradeStmt);
  let inserted = 0;
  const tx = db.transaction((rows: RawActivity[]) => {
    for (const t of rows) {
      const res = stmt.run({
        transaction_hash: t.transactionHash,
        user_wallet: wallet,
        username,
        timestamp: t.timestamp,
        condition_id: t.conditionId,
        asset: t.asset,
        outcome_index: t.outcomeIndex,
        side: t.side,
        size: t.size,
        usdc_size: t.usdcSize,
        price: t.price,
        title: t.title,
        slug: t.slug,
      });
      if (res.changes > 0) inserted++;
    }
  });
  tx(trades);
  return inserted;
}

export function getLatestTradeTimestamp(wallet: string): number | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT MAX(timestamp) as ts FROM trades WHERE user_wallet = ?`)
    .get(wallet) as { ts: number | null } | undefined;
  return row?.ts ?? null;
}

export function setSyncState(wallet: string, lastTs: number): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO sync_state (user_wallet, last_timestamp, last_run_at)
     VALUES (?, ?, ?)
     ON CONFLICT(user_wallet) DO UPDATE SET
       last_timestamp = excluded.last_timestamp,
       last_run_at = excluded.last_run_at`,
  ).run(wallet, lastTs, Math.floor(Date.now() / 1000));
}

export function getSyncState(
  wallet: string,
): { lastTimestamp: number; lastRunAt: number } | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT last_timestamp as lastTimestamp, last_run_at as lastRunAt
       FROM sync_state WHERE user_wallet = ?`,
    )
    .get(wallet) as
    | { lastTimestamp: number; lastRunAt: number }
    | undefined;
  return row ?? null;
}

export function upsertMarketResolutions(resolutions: MarketResolution[]): void {
  if (resolutions.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO markets (condition_id, slug, closed, winning_outcome_index, resolved_at, last_checked)
     VALUES (@condition_id, @slug, @closed, @winning_outcome_index, @resolved_at, @last_checked)
     ON CONFLICT(condition_id) DO UPDATE SET
       slug = excluded.slug,
       closed = excluded.closed,
       winning_outcome_index = excluded.winning_outcome_index,
       resolved_at = excluded.resolved_at,
       last_checked = excluded.last_checked`,
  );
  const now = Math.floor(Date.now() / 1000);
  const tx = db.transaction((rows: MarketResolution[]) => {
    for (const r of rows) {
      stmt.run({
        condition_id: r.conditionId,
        slug: r.slug ?? null,
        closed: r.closed ? 1 : 0,
        winning_outcome_index: r.winningOutcomeIndex,
        resolved_at: r.resolvedAt,
        last_checked: now,
      });
    }
  });
  tx(resolutions);
}

export function getKnownMarketResolutions(): Map<string, MarketResolution> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT condition_id, slug, closed, winning_outcome_index, resolved_at FROM markets`,
    )
    .all() as Array<{
    condition_id: string;
    slug: string | null;
    closed: number;
    winning_outcome_index: number | null;
    resolved_at: number | null;
  }>;
  const out = new Map<string, MarketResolution>();
  for (const r of rows) {
    out.set(r.condition_id, {
      conditionId: r.condition_id,
      slug: r.slug ?? undefined,
      closed: !!r.closed,
      winningOutcomeIndex: r.winning_outcome_index,
      resolvedAt: r.resolved_at,
    });
  }
  return out;
}

export function listAllConditionIds(): string[] {
  const db = getDb();
  const rows = db
    .prepare(`SELECT DISTINCT condition_id FROM trades`)
    .all() as Array<{ condition_id: string }>;
  return rows.map((r) => r.condition_id);
}

export function loadTradesForUser(wallet: string): Array<{
  transactionHash: string;
  timestamp: number;
  conditionId: string;
  asset: string;
  outcomeIndex: number;
  side: "BUY" | "SELL";
  size: number;
  usdcSize: number;
  price: number;
  title: string;
  slug: string;
  username: string;
}> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         transaction_hash as transactionHash,
         timestamp, condition_id as conditionId, asset,
         outcome_index as outcomeIndex, side, size,
         usdc_size as usdcSize, price, title, slug, username
       FROM trades WHERE user_wallet = ?
       ORDER BY timestamp ASC, ROWID ASC`,
    )
    .all(wallet) as Array<{
    transactionHash: string;
    timestamp: number;
    conditionId: string;
    asset: string;
    outcomeIndex: number;
    side: string;
    size: number;
    usdcSize: number;
    price: number;
    title: string;
    slug: string;
    username: string;
  }>;
  return rows.map((r) => ({ ...r, side: r.side as "BUY" | "SELL" }));
}

export function replaceBets(wallet: string, bets: BetRecord[]): void {
  const db = getDb();
  const del = db.prepare(`DELETE FROM bets WHERE user_wallet = ?`);
  const ins = db.prepare(
    `INSERT OR IGNORE INTO bets (
       transaction_hash, user_wallet, username, timestamp, condition_id, asset,
       outcome_index, size, usdc_size, price, title, slug,
       closed_via, realized_pnl, is_win
     ) VALUES (
       @transaction_hash, @user_wallet, @username, @timestamp, @condition_id, @asset,
       @outcome_index, @size, @usdc_size, @price, @title, @slug,
       @closed_via, @realized_pnl, @is_win
     )`,
  );
  const tx = db.transaction((rows: BetRecord[]) => {
    del.run(wallet);
    for (const b of rows) {
      ins.run({
        transaction_hash: b.transactionHash,
        user_wallet: b.userWallet,
        username: b.username,
        timestamp: b.timestamp,
        condition_id: b.conditionId,
        asset: b.asset,
        outcome_index: b.outcomeIndex,
        size: b.size,
        usdc_size: b.usdcSize,
        price: b.price,
        title: b.title,
        slug: b.slug,
        closed_via: b.closedVia,
        realized_pnl: b.realizedPnl,
        is_win: b.isWin,
      });
    }
  });
  tx(bets);
}

export function loadBets(wallet: string): BetRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         transaction_hash as transactionHash,
         user_wallet as userWallet,
         username, timestamp,
         condition_id as conditionId, asset,
         outcome_index as outcomeIndex,
         'BUY' as side,
         size, usdc_size as usdcSize, price, title, slug,
         closed_via as closedVia, realized_pnl as realizedPnl, is_win as isWin
       FROM bets WHERE user_wallet = ? ORDER BY timestamp ASC`,
    )
    .all(wallet) as BetRecord[];
  return rows;
}

export function loadAllBets(): BetRecord[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         transaction_hash as transactionHash,
         user_wallet as userWallet,
         username, timestamp,
         condition_id as conditionId, asset,
         outcome_index as outcomeIndex,
         'BUY' as side,
         size, usdc_size as usdcSize, price, title, slug,
         closed_via as closedVia, realized_pnl as realizedPnl, is_win as isWin
       FROM bets ORDER BY timestamp ASC`,
    )
    .all() as BetRecord[];
  return rows;
}

export function hasAlertBeenSent(
  txHash: string,
  wallet: string,
  asset: string,
): boolean {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT 1 FROM alerts_sent
       WHERE transaction_hash = ? AND user_wallet = ? AND asset = ?`,
    )
    .get(txHash, wallet, asset);
  return !!row;
}

export function recordAlertSent(
  txHash: string,
  wallet: string,
  asset: string,
  percentile: number,
): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO alerts_sent
     (transaction_hash, user_wallet, asset, sent_at, percentile)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(txHash, wallet, asset, Math.floor(Date.now() / 1000), percentile);
}
