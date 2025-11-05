import { ChartDataPoint } from "./types";

export type Timeframe = "5M" | "15M" | "1H" | "4H" | "1D" | "1W";

export async function fetchChartData(
  tokenAddress: string,
  timeframe: Timeframe
): Promise<ChartDataPoint[]> {
  // In production, this would fetch from a backend API or directly from blockchain
  // For now, we'll generate sample data
  return generateSampleChartData(timeframe);
}

function generateSampleChartData(timeframe: Timeframe): ChartDataPoint[] {
  const intervals: Record<Timeframe, number> = {
    "5M": 5 * 60,
    "15M": 15 * 60,
    "1H": 60 * 60,
    "4H": 4 * 60 * 60,
    "1D": 24 * 60 * 60,
    "1W": 7 * 24 * 60 * 60,
  };

  const interval = intervals[timeframe];
  const dataPoints = 100;
  const data: ChartDataPoint[] = [];
  const now = Math.floor(Date.now() / 1000);
  let price = 100;

  for (let i = dataPoints; i > 0; i--) {
    const time = now - i * interval;
    const volatility = 2;
    const change = (Math.random() - 0.5) * volatility;

    price += change;
    price = Math.max(price, 50); // Keep price above 50

    const open = price;
    const close = price + (Math.random() - 0.5) * volatility;
    const high = Math.max(open, close) + Math.random() * volatility;
    const low = Math.min(open, close) - Math.random() * volatility;
    const volume = Math.random() * 100000;

    data.push({
      time,
      open,
      high,
      low,
      close,
      volume,
    });

    price = close;
  }

  return data;
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
  const changePercent = (change / firstPrice) * 100;

  return { change, changePercent };
}

export function calculateVolume24h(data: ChartDataPoint[]): number {
  const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
  const recentData = data.filter((d) => d.time >= oneDayAgo);

  return recentData.reduce((sum, d) => sum + (d.volume || 0), 0);
}
