import { ethers } from "ethers";
import { OPN_CHAIN_CONFIG } from "./config";
import { getSwapEvents, getPairReserves, findTokenPair } from "./web3";
import { ChartDataPoint } from "./types";

interface HistoricalSwap {
  timestamp: number;
  price: number;
  volume: number;
  blockNumber: number;
}

// Cache for historical data
const priceHistoryCache = new Map<string, {
  data: HistoricalSwap[];
  lastFetch: number;
}>();

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches ALL historical swaps for a token to build proper price history
 */
export async function fetchCompleteSwapHistory(
  tokenAddress: string,
  maxBlocks: number = 100000 // Fetch last ~100k blocks for history
): Promise<HistoricalSwap[]> {
  const cacheKey = tokenAddress.toLowerCase();

  // Check cache
  const cached = priceHistoryCache.get(cacheKey);
  if (cached && Date.now() - cached.lastFetch < CACHE_DURATION) {
    console.log("📦 Using cached swap history");
    return cached.data;
  }

  console.log("🔍 Fetching complete swap history from blockchain...");

  try {
    const pairAddress = await findTokenPair(tokenAddress);
    if (!pairAddress) {
      console.log("No pair found");
      return [];
    }

    const reserves = await getPairReserves(pairAddress);
    const isToken0 = reserves.token0.toLowerCase() === tokenAddress.toLowerCase();

    const provider = new ethers.JsonRpcProvider(OPN_CHAIN_CONFIG.rpcUrl);
    const currentBlock = await provider.getBlockNumber();

    // Fetch in chunks to avoid RPC limits
    const CHUNK_SIZE = 10000;
    const allSwaps: HistoricalSwap[] = [];
    const fromBlock = Math.max(0, currentBlock - maxBlocks);

    console.log(`Fetching from block ${fromBlock} to ${currentBlock} (${currentBlock - fromBlock} blocks)`);

    for (let block = fromBlock; block < currentBlock; block += CHUNK_SIZE) {
      const toBlock = Math.min(block + CHUNK_SIZE, currentBlock);
      console.log(`  Chunk: ${block} to ${toBlock}`);

      try {
        const events = await getSwapEvents(pairAddress, block, toBlock);

        for (const event of events) {
          try {
            const blockData = await event.getBlock();
            if (!blockData || !event.args) continue;

            const args = event.args;
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

            const tokenAmountNum = Number(tokenAmount) / 1e18;
            const wopnAmountNum = Number(wopnAmount) / 1e18;

            if (tokenAmountNum === 0 || wopnAmountNum === 0) continue;

            const priceInWOPN = wopnAmountNum / tokenAmountNum;
            const priceInUSD = priceInWOPN * OPN_CHAIN_CONFIG.opnPriceUSD;
            const volumeUSD = wopnAmountNum * OPN_CHAIN_CONFIG.opnPriceUSD;

            allSwaps.push({
              timestamp: blockData.timestamp,
              price: priceInUSD,
              volume: volumeUSD,
              blockNumber: blockData.number,
            });
          } catch (err) {
            console.error("Error processing event:", err);
          }
        }
      } catch (err) {
        console.error(`Error fetching chunk ${block}-${toBlock}:`, err);
      }
    }

    // Sort by timestamp
    allSwaps.sort((a, b) => a.timestamp - b.timestamp);

    console.log(`✅ Fetched ${allSwaps.length} historical swaps`);

    // Cache the results
    priceHistoryCache.set(cacheKey, {
      data: allSwaps,
      lastFetch: Date.now(),
    });

    return allSwaps;
  } catch (error) {
    console.error("Error fetching swap history:", error);
    return [];
  }
}

/**
 * Builds OHLCV candles from swap history
 */
export function buildCandlesFromSwaps(
  swaps: HistoricalSwap[],
  intervalSeconds: number
): ChartDataPoint[] {
  if (swaps.length === 0) return [];

  const candles: ChartDataPoint[] = [];
  const firstTimestamp = swaps[0].timestamp;
  const lastTimestamp = swaps[swaps.length - 1].timestamp;

  // Create time buckets
  const startTime = Math.floor(firstTimestamp / intervalSeconds) * intervalSeconds;
  const endTime = Math.floor(lastTimestamp / intervalSeconds) * intervalSeconds;

  let currentPrice = swaps[0].price;
  let previousClose = swaps[0].price;

  for (let time = startTime; time <= endTime; time += intervalSeconds) {
    const periodEnd = time + intervalSeconds;
    const periodSwaps = swaps.filter(s => s.timestamp >= time && s.timestamp < periodEnd);

    if (periodSwaps.length === 0) {
      // No swaps in this period - flat candle at previous close
      candles.push({
        time,
        open: previousClose,
        high: previousClose,
        low: previousClose,
        close: previousClose,
        value: previousClose,
        volume: 0,
      });
    } else {
      const open = periodSwaps[0].price;
      const close = periodSwaps[periodSwaps.length - 1].price;
      const high = Math.max(...periodSwaps.map(s => s.price));
      const low = Math.min(...periodSwaps.map(s => s.price));
      const volume = periodSwaps.reduce((sum, s) => sum + s.volume, 0);

      candles.push({
        time,
        open,
        high,
        low,
        close,
        value: close,
        volume,
      });

      previousClose = close;
      currentPrice = close;
    }
  }

  return candles;
}

/**
 * Gets current price from latest swap
 */
export async function getCurrentPrice(tokenAddress: string): Promise<number> {
  try {
    const pairAddress = await findTokenPair(tokenAddress);
    if (!pairAddress) return 0;

    const reserves = await getPairReserves(pairAddress);
    const isToken0 = reserves.token0.toLowerCase() === tokenAddress.toLowerCase();

    const tokenReserve = isToken0 ? reserves.reserve0 : reserves.reserve1;
    const wopnReserve = isToken0 ? reserves.reserve1 : reserves.reserve0;

    const tokenReserveBN = BigInt(tokenReserve);
    const wopnReserveBN = BigInt(wopnReserve);

    if (tokenReserveBN === 0n) return 0;

    const priceInWOPN = Number(wopnReserveBN * BigInt(1e18)) / Number(tokenReserveBN) / 1e18;
    return priceInWOPN * OPN_CHAIN_CONFIG.opnPriceUSD;
  } catch (error) {
    console.error("Error getting current price:", error);
    return 0;
  }
}

export function clearCache() {
  priceHistoryCache.clear();
}
