// OPN Chain Configuration
export const OPN_CHAIN_CONFIG = {
  chainId: 984, // OPN Testnet
  rpcUrl: process.env.NEXT_PUBLIC_OPN_RPC_URL || "https://testnet-rpc.iopn.tech",
  explorerUrl: "https://testnet.iopn.tech",
  nativeCurrency: {
    name: "OPN",
    symbol: "OPN",
    decimals: 18,
  },
  opnPriceUSD: 0.05, // OPN price in USD
};

// DEX contract addresses on OPN testnet
export const DEX_CONTRACTS = {
  // UniswapV2-style DEX factory
  factory: process.env.NEXT_PUBLIC_FACTORY_ADDRESS || "0x8860242B65611dfd077aEe26C3C7920813dF9208",
  router: process.env.NEXT_PUBLIC_ROUTER_ADDRESS || "0xB489bce5c9c9364da2D1D1Bc5CE4274F63141885",
  // Wrapped OPN token
  WOPN: process.env.NEXT_PUBLIC_WOPN_ADDRESS || "0xBc022C9dEb5AF250A526321d16Ef52E39b4DBD84",
};

// API endpoints (if using a backend service)
export const API_ENDPOINTS = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  tokens: "/api/tokens",
  pairs: "/api/pairs",
  transactions: "/api/transactions",
  chart: "/api/chart",
};
