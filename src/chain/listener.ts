import { createPublicClient, webSocket } from "viem";
import { polygon } from "viem/chains";
import {
  CTF_EXCHANGE,
  NEG_RISK_CTF_EXCHANGE,
  ORDER_FILLED_ABI,
} from "./contracts.js";
import { config } from "../config.js";
import { logger } from "../logger.js";
import { handleOrderFilled } from "../scraper/watcherFilter.js";

function makeSubscription(
  client: ReturnType<typeof createPublicClient>,
  address: `0x${string}`,
): () => void {
  return client.watchContractEvent({
    address,
    abi: ORDER_FILLED_ABI,
    eventName: "OrderFilled",
    strict: false,
    onLogs: (logs) => {
      for (const log of logs) {
        const a = log.args as Record<string, unknown> | undefined;
        if (!a) continue;
        handleOrderFilled({
          txHash: log.transactionHash ?? "",
          maker: (a.maker ?? "") as `0x${string}`,
          taker: (a.taker ?? "") as `0x${string}`,
          makerAssetId: (a.makerAssetId ?? 0n) as bigint,
          takerAssetId: (a.takerAssetId ?? 0n) as bigint,
          makerAmountFilled: (a.makerAmountFilled ?? 0n) as bigint,
          takerAmountFilled: (a.takerAmountFilled ?? 0n) as bigint,
        }).catch((err) =>
          logger.error({ err, txHash: log.transactionHash }, "watch filter error"),
        );
      }
    },
    onError: (err) => logger.error({ err, address }, "chain listener error"),
  });
}

export function startChainListener(): () => void {
  const transport = webSocket(config.polygonWsUrl, {
    reconnect: { attempts: Infinity, delay: 2000 },
    timeout: 60_000,
  });

  const client = createPublicClient({ chain: polygon, transport });

  const unwatchMain = makeSubscription(client, CTF_EXCHANGE);
  const unwatchNegRisk = makeSubscription(client, NEG_RISK_CTF_EXCHANGE);

  logger.info(
    { ctf: CTF_EXCHANGE, negRisk: NEG_RISK_CTF_EXCHANGE },
    "chain listener started",
  );

  return () => {
    unwatchMain();
    unwatchNegRisk();
  };
}
