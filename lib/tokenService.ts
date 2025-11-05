import { getTokenInfo, getPairReserves } from "./web3";
import { Token, TokenPrice, TokenInfo } from "./types";

export async function fetchTokenData(tokenAddress: string): Promise<TokenInfo | null> {
  try {
    const token = await getTokenInfo(tokenAddress);

    // Mock price data for now - in production, fetch from DEX or API
    const price: TokenPrice = {
      price: 1.234,
      priceChange24h: 12.45,
      volume24h: 456789,
      marketCap: 1234567,
      liquidity: 234567,
      holders: 1234,
    };

    // Mock pair data - in production, fetch actual pair
    const pair = {
      pairAddress: "0x0000000000000000000000000000000000000000",
      token0: token,
      token1: {
        address: "0x0000000000000000000000000000000000000000",
        name: "Wrapped OPN",
        symbol: "WOPN",
        decimals: 18,
      },
      reserve0: "1000000",
      reserve1: "1000000",
      totalSupply: "1000000",
    };

    return {
      token,
      price,
      pair,
    };
  } catch (error) {
    console.error("Error fetching token data:", error);
    return null;
  }
}

export async function fetchTrendingTokens(): Promise<Token[]> {
  // Mock trending tokens - in production, fetch from API or calculate from on-chain data
  return [
    {
      address: "0x0000000000000000000000000000000000000001",
      name: "Wrapped OPN",
      symbol: "WOPN",
      decimals: 18,
    },
    {
      address: "0x0000000000000000000000000000000000000002",
      name: "Token A",
      symbol: "TKA",
      decimals: 18,
    },
    {
      address: "0x0000000000000000000000000000000000000003",
      name: "Token B",
      symbol: "TKB",
      decimals: 18,
    },
  ];
}

export function formatTokenAmount(amount: string, decimals: number): string {
  try {
    const value = BigInt(amount);
    const divisor = BigInt(10 ** decimals);
    const result = Number(value) / Number(divisor);
    return result.toLocaleString(undefined, { maximumFractionDigits: 4 });
  } catch {
    return "0";
  }
}

export function formatPrice(price: number): string {
  if (price < 0.01) {
    return `$${price.toFixed(6)}`;
  } else if (price < 1) {
    return `$${price.toFixed(4)}`;
  } else {
    return `$${price.toFixed(2)}`;
  }
}

export function formatPercentChange(change: number): string {
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(2)}%`;
}
