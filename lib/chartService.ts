import { ChartDataPoint } from "./types";
import { getSwapEvents, getPairReserves, findTokenPair } from "./web3";
import { OPN_CHAIN_CONFIG } from "./config";
import { ethers } from "ethers";

export type Timeframe = "5M" | "15M" | "1H" | "4H" | "1D" | "1W";

interface SwapData {
  timestamp: number;
  price: number;
  volume: number;
}

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "5M": 5 * 60,
  "15M": 15 * 60,
  "1H": 60 * 60,
  "4H": 4 * 60 * 60,
  "1D": 24 * 60 * 60,
  "1W": 7 * 24 * 60 * 60,
};

const TIMEFRAME_BLOCKS: Record<Timeframe, number> = {
  "5M": 150,      // ~5 min of blocks
  "15M": 450,     // ~15 min
  "1H": 1800,     // ~1 hour
  "4H": 7200,     // ~4 hours
  "1D": 43200,    // ~1 day
  "1W": 302400,   // ~1 week
};

export async function fetchChartData(
  tokenAddress: string,
  timeframe: Timeframe
): Promise<ChartDataPoint[]> {
  try {
    console.log(`Fetching chart data for ${tokenAddress} with timeframe ${timeframe}`);

    const pairAddress = await findTokenPair(tokenAddress);
    if (!pairAddress) {
      console.log("No pair found, returning empty data");
      return [];
    }

    const reserves = await getPairReserves(pairAddress);
    const isToken0 = reserves.token0.toLowerCase() === tokenAddress.toLowerCase();

    const provider = new ethers.JsonRpcProvider(OPN_CHAIN_CONFIG.rpcUrl);
    const currentBlock = await provider.getBlockNumber();

    // Fetch enough blocks to get good data
    const blocksToFetch = TIMEFRAME_BLOCKS[timeframe] * 100; // Get 100 candles worth
    const fromBlock = Math.max(0, currentBlock - blocksToFetch);

    console.log(`Fetching swaps from block ${fromBlock} to ${currentBlock}`);
    const events = await getSwapEvents(pairAddress, fromBlock);
    console.log(`Found ${events.length} swap events`);

    if (events.length === 0) {
      // Return current price as single data point if no swaps
      const currentPrice = calculateCurrentPrice(reserves, isToken0);
      return [{
        time: Math.floor(Date.now() / 1000),
        open: currentPrice,
        high: currentPrice,
        low: currentPrice,
        close: currentPrice,
        value: currentPrice,
        volume: 0,
      }];
    }

    // Convert events to swap data with prices
    const swaps: SwapData[] = [];

    for (const event of events) {
      try {
        const block = await event.getBlock();
        if (!block || !event.args) continue;

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

        if (tokenAmountNum === 0) continue;

        const priceInWOPN = wopnAmountNum / tokenAmountNum;
        const priceInUSD = priceInWOPN * OPN_CHAIN_CONFIG.opnPriceUSD;
        const volumeUSD = wopnAmountNum * OPN_CHAIN_CONFIG.opnPriceUSD;

        swaps.push({
          timestamp: block.timestamp,
          price: priceInUSD,
          volume: volumeUSD,
        });
      } catch (err) {
        console.error("Error processing swap event:", err);
        continue;
      }
    }

    if (swaps.length === 0) {
      const currentPrice = calculateCurrentPrice(reserves, isToken0);
      return [{
        time: Math.floor(Date.now() / 1000),
        open: currentPrice,
        high: currentPrice,
        low: currentPrice,
        close: currentPrice,
        value: currentPrice,
        volume: 0,
      }];
    }

    // Sort by timestamp
    swaps.sort((a, b) => a.timestamp - b.timestamp);

    // Group into OHLCV candles
    const candles = groupSwapsIntoCandles(swaps, TIMEFRAME_SECONDS[timeframe]);

    console.log(`Generated ${candles.length} candles`);
    return candles;
  } catch (error) {
    console.error("Error fetching chart data:", error);
    return [];
  }
}

function calculateCurrentPrice(reserves: any, isToken0: boolean): number {
  const tokenReserve = isToken0 ? reserves.reserve0 : reserves.reserve1;
  const wopnReserve = isToken0 ? reserves.reserve1 : reserves.reserve0;

  const tokenReserveBN = BigInt(tokenReserve);
  const wopnReserveBN = BigInt(wopnReserve);

  if (tokenReserveBN === 0n) return 0;

  const priceInWOPN = Number(wopnReserveBN * BigInt(1e18)) / Number(tokenReserveBN) / 1e18;
  return priceInWOPN * OPN_CHAIN_CONFIG.opnPriceUSD;
}

function groupSwapsIntoCandles(swaps: SwapData[], intervalSeconds: number): ChartDataPoint[] {
  if (swaps.length === 0) return [];

  const candles: ChartDataPoint[] = [];
  const firstTimestamp = swaps[0].timestamp;
  const lastTimestamp = swaps[swaps.length - 1].timestamp;

  // Create time buckets
  const startTime = Math.floor(firstTimestamp / intervalSeconds) * intervalSeconds;
  const endTime = Math.floor(lastTimestamp / intervalSeconds) * intervalSeconds;

  let currentPrice = swaps[0].price;

  for (let time = startTime; time <= endTime; time += intervalSeconds) {
    const periodEnd = time + intervalSeconds;
    const periodSwaps = swaps.filter(s => s.timestamp >= time && s.timestamp < periodEnd);

    if (periodSwaps.length === 0) {
      // No swaps in this period, use last known price
      candles.push({
        time,
        open: currentPrice,
        high: currentPrice,
        low: currentPrice,
        close: currentPrice,
        value: currentPrice,
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

      currentPrice = close;
    }
  }

  return candles;
}

export function calculatePriceChange(
  data: ChartDataPoint[]
): { change: number; changePercent: number } {
  if (data.length < 2) {
    return { change: 0, changePercent: 0 };
  }

  const firstPrice = data[0].close || data[0].value || 0;
  const lastPrice = data[data.length - 1].close || data[data.length - 1].value || 0;

  const change = lastPrice - firstPrice;
  const changePercent = firstPrice > 0 ? (change / firstPrice) * 100 : 0;

  return { change, changePercent };
}

export function calculateVolume24h(data: ChartDataPoint[]): number {
  const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  const recentData = data.filter((d) => d.time >= oneDayAgo);

  return recentData.reduce((sum, d) => sum + (d.volume || 0), 0);
}
