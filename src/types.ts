export type Side = "BUY" | "SELL";

export type ClosedVia = "sell" | "resolution" | "open";

export interface Profile {
  username: string;
  proxyWallet: string;
  name?: string;
  bio?: string;
  pseudonym?: string;
}

export interface RawActivity {
  timestamp: number;
  conditionId: string;
  asset: string;
  outcomeIndex: number;
  outcome?: string;
  side: Side;
  size: number;
  usdcSize: number;
  price: number;
  title: string;
  slug: string;
  transactionHash: string;
  user?: string;
  pseudonym?: string;
}

export interface MarketResolution {
  conditionId: string;
  slug?: string;
  closed: boolean;
  winningOutcomeIndex: number | null;
  resolvedAt: number | null;
}

export interface BetRecord {
  transactionHash: string;
  userWallet: string;
  username: string;
  timestamp: number;
  conditionId: string;
  asset: string;
  outcomeIndex: number;
  side: Side;
  size: number;
  usdcSize: number;
  price: number;
  title: string;
  slug: string;
  closedVia: ClosedVia;
  realizedPnl: number | null;
  isWin: 0 | 1 | null;
}

export interface BucketStats {
  label: string;
  lower: number | null;
  upper: number | null;
  n: number;
  wins: number;
  winRate: number | null;
}

export interface UserSummary {
  username: string;
  wallet: string;
  totalBets: number;
  closedBets: number;
  openBets: number;
  meanBetSize: number;
  stddevBetSize: number;
  medianBetSize: number;
  skewness: number;
  kurtosis: number;
  overallWinRate: number | null;
  buckets: BucketStats[];
  shape: {
    sizeSkewness: number;
    sizeKurtosis: number;
    winRateVsSizeSkew: number;
    monotone: "increasing" | "decreasing" | "mixed";
    classification: "approx_normal" | "right_skew" | "left_skew" | "heavy_tail";
  };
}

export interface CrossoverMarket {
  conditionId: string;
  title: string;
  slug: string;
  sameSide: boolean;
  users: Array<{
    username: string;
    outcomeIndex: number;
    totalUsdc: number;
    firstTimestamp: number;
    lastTimestamp: number;
    nTrades: number;
  }>;
}

export interface CrossoverReport {
  sameSideCount: number;
  oppositeSideCount: number;
  sameSide: CrossoverMarket[];
  oppositeSide: CrossoverMarket[];
}

export interface AnalysisReport {
  generatedAt: string;
  users: UserSummary[];
  crossover: CrossoverReport;
}
