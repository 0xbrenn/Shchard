import { ChartDataPoint } from "./types";
import { fetchCompleteSwapHistory, buildCandlesFromSwaps, getCurrentPrice } from "./historicalDataService";

export type Timeframe = "5M" | "15M" | "1H" | "4H" | "1D" | "1W";

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "5M": 5 * 60,
  "15M": 15 * 60,
  "1H": 60 * 60,
  "4H": 4 * 60 * 60,
  "1D": 24 * 60 * 60,
  "1W": 7 * 24 * 60 * 60,
};

export async function fetchChartData(
  tokenAddress: string,
  timeframe: Timeframe
): Promise<ChartDataPoint[]> {
  try {
    console.log(`📊 Fetching chart data for ${tokenAddress} (${timeframe})`);

    // Fetch complete swap history
    const swaps = await fetchCompleteSwapHistory(tokenAddress);

    if (swaps.length === 0) {
      console.log("No swap history found");
      // Return current price as single point
      const currentPrice = await getCurrentPrice(tokenAddress);
      if (currentPrice > 0) {
        const now = Math.floor(Date.now() / 1000);
        return [{
          time: now,
          open: currentPrice,
          high: currentPrice,
          low: currentPrice,
          close: currentPrice,
          value: currentPrice,
          volume: 0,
        }];
      }
      return [];
    }

    console.log(`Building candles from ${swaps.length} swaps`);

    // Build candles from swaps
    const intervalSeconds = TIMEFRAME_SECONDS[timeframe];
    const candles = buildCandlesFromSwaps(swaps, intervalSeconds);

    console.log(`✅ Generated ${candles.length} candles for ${timeframe}`);

    return candles;
  } catch (error) {
    console.error("Error fetching chart data:", error);
    return [];
  }
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
