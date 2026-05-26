// Polymarket CTF Exchange — handles binary (yes/no) markets
export const CTF_EXCHANGE =
  "0x4bFb41d5B3570DeFd03C39a9A4D8de6bd8B8982e" as const;

// Polymarket NegRisk CTF Exchange — handles multi-outcome markets (elections, etc.)
export const NEG_RISK_CTF_EXCHANGE =
  "0xC5d563A36AE78145C45a50134d48A1D220B071A7" as const;

export const ORDER_FILLED_ABI = [
  {
    type: "event",
    name: "OrderFilled",
    inputs: [
      { name: "orderHash", type: "bytes32", indexed: true },
      { name: "maker", type: "address", indexed: true },
      { name: "taker", type: "address", indexed: true },
      { name: "makerAssetId", type: "uint256", indexed: false },
      { name: "takerAssetId", type: "uint256", indexed: false },
      { name: "makerAmountFilled", type: "uint256", indexed: false },
      { name: "takerAmountFilled", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
] as const;
