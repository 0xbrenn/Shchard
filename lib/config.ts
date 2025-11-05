// OPN Chain Configuration
export const OPN_CHAIN_CONFIG = {
  chainId: 9012, // Example chain ID for OPN - update with actual
  rpcUrl: process.env.NEXT_PUBLIC_OPN_RPC_URL || "https://rpc.opn.network",
  explorerUrl: "https://explorer.opn.network",
  nativeCurrency: {
    name: "OPN",
    symbol: "OPN",
    decimals: 18,
  },
};

// Common DEX factory addresses on OPN chain (update with actual addresses)
export const DEX_CONTRACTS = {
  // UniswapV2-style DEX factory
  factory: process.env.NEXT_PUBLIC_DEX_FACTORY || "0x0000000000000000000000000000000000000000",
  router: process.env.NEXT_PUBLIC_DEX_ROUTER || "0x0000000000000000000000000000000000000000",
  // Common base tokens for pairs
  WOPN: process.env.NEXT_PUBLIC_WOPN || "0x0000000000000000000000000000000000000000",
};

// API endpoints (if using a backend service)
export const API_ENDPOINTS = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
  tokens: "/api/tokens",
  pairs: "/api/pairs",
  transactions: "/api/transactions",
  chart: "/api/chart",
};
