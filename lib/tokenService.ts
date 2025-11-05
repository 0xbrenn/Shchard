import { getTokenInfo, getPairReserves, findTokenPair, getSwapEvents } from "./web3";
import { Token, TokenPrice, TokenInfo, Transaction } from "./types";
import { OPN_CHAIN_CONFIG, DEX_CONTRACTS } from "./config";
import { ethers } from "ethers";

export async function fetchTokenData(tokenAddress: string): Promise<TokenInfo | null> {
  try {
    console.log("Fetching token data for:", tokenAddress);

    // Fetch token info
    const token = await getTokenInfo(tokenAddress);
    console.log("Token info:", token);

    // Find pair with WOPN
    const pairAddress = await findTokenPair(tokenAddress);
    console.log("Pair address:", pairAddress);

    if (!pairAddress) {
      throw new Error("No trading pair found for this token");
    }

    // Fetch pair reserves
    const reserves = await getPairReserves(pairAddress);
    console.log("Reserves:", reserves);

    // Get WOPN token info
    const wopnToken = await getTokenInfo(DEX_CONTRACTS.WOPN);

    // Determine which token is which in the pair
    const isToken0 = reserves.token0.toLowerCase() === tokenAddress.toLowerCase();
    const tokenReserve = isToken0 ? reserves.reserve0 : reserves.reserve1;
    const wopnReserve = isToken0 ? reserves.reserve1 : reserves.reserve0;

    // Calculate price in WOPN
    const tokenReserveBN = BigInt(tokenReserve);
    const wopnReserveBN = BigInt(wopnReserve);

    let priceInWOPN = 0;
    if (tokenReserveBN > 0n) {
      // Price = WOPN reserve / Token reserve
      priceInWOPN = Number(wopnReserveBN * BigInt(1e18)) / Number(tokenReserveBN);
      priceInWOPN = priceInWOPN / 1e18;
    }

    // Calculate price in USD (WOPN price * price in WOPN)
    const priceInUSD = priceInWOPN * OPN_CHAIN_CONFIG.opnPriceUSD;

    // Calculate liquidity in USD
    const wopnReserveFormatted = Number(wopnReserveBN) / 1e18;
    const liquidityUSD = wopnReserveFormatted * OPN_CHAIN_CONFIG.opnPriceUSD * 2; // Multiply by 2 for total liquidity

    // Calculate token supply and market cap
    const tokenReserveFormatted = Number(tokenReserveBN) / Math.pow(10, token.decimals);

    const price: TokenPrice = {
      price: priceInUSD,
      priceChange24h: 0, // Would need historical data
      volume24h: 0, // Would need to calculate from events
      marketCap: 0, // Would need total supply
      liquidity: liquidityUSD,
      holders: 0, // Would need to track from events or indexer
    };

    const pair = {
      pairAddress,
      token0: isToken0 ? token : wopnToken,
      token1: isToken0 ? wopnToken : token,
      reserve0: reserves.reserve0,
      reserve1: reserves.reserve1,
      totalSupply: "0", // Could fetch from pair contract
    };

    console.log("Final price data:", price);

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

export async function fetchTokenTransactions(
  tokenAddress: string,
  limit: number = 20
): Promise<Transaction[]> {
  try {
    const pairAddress = await findTokenPair(tokenAddress);
    if (!pairAddress) return [];

    const provider = new ethers.JsonRpcProvider(OPN_CHAIN_CONFIG.rpcUrl);
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 10000); // Last ~10k blocks

    const events = await getSwapEvents(pairAddress, fromBlock);
    const reserves = await getPairReserves(pairAddress);
    const isToken0 = reserves.token0.toLowerCase() === tokenAddress.toLowerCase();

    const transactions: Transaction[] = [];

    for (const event of events.slice(0, limit)) {
      const block = await event.getBlock();
      const args = event.args;

      if (!args || !block) continue;

      const amount0In = args[1];
      const amount1In = args[2];
      const amount0Out = args[3];
      const amount1Out = args[4];

      const isBuy = isToken0 ? amount0Out > 0n : amount1Out > 0n;
      const tokenAmount = isToken0
        ? (isBuy ? amount0Out : amount0In)
        : (isBuy ? amount1Out : amount1In);
      const wopnAmount = isToken0
        ? (isBuy ? amount1In : amount1Out)
        : (isBuy ? amount0In : amount0Out);

      const tokenAmountFormatted = Number(tokenAmount) / 1e18;
      const wopnAmountFormatted = Number(wopnAmount) / 1e18;
      const priceInWOPN = tokenAmountFormatted > 0 ? wopnAmountFormatted / tokenAmountFormatted : 0;
      const priceInUSD = priceInWOPN * OPN_CHAIN_CONFIG.opnPriceUSD;
      const totalUSD = wopnAmountFormatted * OPN_CHAIN_CONFIG.opnPriceUSD;

      transactions.push({
        type: isBuy ? "buy" : "sell",
        amount: tokenAmountFormatted.toFixed(4),
        price: `$${priceInUSD.toFixed(6)}`,
        total: `$${totalUSD.toFixed(2)}`,
        timestamp: new Date(block.timestamp * 1000),
        txHash: event.transactionHash,
        from: args[0],
        to: args[5],
      });
    }

    return transactions;
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return [];
  }
}

export async function fetchTrendingTokens(): Promise<Token[]> {
  try {
    // Return WOPN as default trending token
    const wopnToken = await getTokenInfo(DEX_CONTRACTS.WOPN);
    return [wopnToken];
  } catch (error) {
    console.error("Error fetching trending tokens:", error);
    return [];
  }
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
