import { z } from "zod";
import { config } from "../config.js";
import { logger } from "../logger.js";

class RateLimiter {
  private times: number[] = [];
  constructor(private readonly rps: number) {}

  async wait(): Promise<void> {
    const now = Date.now();
    this.times = this.times.filter((t) => now - t < 1000);
    if (this.times.length >= this.rps) {
      const oldest = this.times[0]!;
      const delay = 1000 - (now - oldest);
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    }
    this.times.push(Date.now());
  }
}

const limiter = new RateLimiter(config.http.rpsLimit);

export interface FetchOptions {
  query?: Record<string, string | number | boolean | undefined>;
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
}

function buildUrl(url: string, query?: FetchOptions["query"]): string {
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

export async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
  opts: FetchOptions = {},
): Promise<T> {
  const full = buildUrl(url, opts.query);
  let lastErr: unknown;
  for (let attempt = 0; attempt <= config.http.maxRetries; attempt++) {
    await limiter.wait();
    try {
      const res = await fetch(full, {
        method: opts.method ?? "GET",
        headers: {
          accept: "application/json",
          ...(opts.body ? { "content-type": "application/json" } : {}),
          ...opts.headers,
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
      if (res.status === 429 || res.status >= 500) {
        throw new Error(`HTTP ${res.status} from ${full}`);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
      }
      const json = await res.json();
      return schema.parse(json);
    } catch (err) {
      lastErr = err;
      if (attempt === config.http.maxRetries) break;
      const backoff = Math.min(30_000, 500 * 2 ** attempt) + Math.random() * 250;
      logger.warn(
        { err: (err as Error).message, attempt, backoff },
        "request failed, retrying",
      );
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}
