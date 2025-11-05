export interface Token {
  address: string;
  name: string;
  symbol: string;
  decimals: number;
  logoUrl?: string;
}

export interface TokenPair {
  pairAddress: string;
  token0: Token;
  token1: Token;
  reserve0: string;
  reserve1: string;
  totalSupply: string;
}

export interface TokenPrice {
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  liquidity: number;
  holders: number;
}

export interface Transaction {
  type: "buy" | "sell";
  amount: string;
  price: string;
  total: string;
  timestamp: Date;
  txHash: string;
  from: string;
  to: string;
}

export interface ChartDataPoint {
  time: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  value?: number;
  volume?: number;
}

export interface TokenInfo {
  token: Token;
  price: TokenPrice;
  pair: TokenPair;
}
