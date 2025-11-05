"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, IChartApi, CandlestickData, LineData, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { fetchChartData, Timeframe, calculatePriceChange } from "@/lib/chartService";
import { getWebSocketService, SwapEvent } from "@/lib/websocketService";
import { findTokenPair, getPairReserves } from "@/lib/web3";

interface ChartSectionProps {
  tokenAddress: string | null;
}

export default function ChartSection({ tokenAddress }: ChartSectionProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("1H");
  const [chartType, setChartType] = useState<"candlestick" | "line">("candlestick");
  const [loading, setLoading] = useState(false);
  const [priceChange, setPriceChange] = useState({ change: 0, changePercent: 0 });
  const [currentPrice, setCurrentPrice] = useState(0);
  const [liveSwapIndicator, setLiveSwapIndicator] = useState<SwapEvent | null>(null);
  const [isLive, setIsLive] = useState(false);
  const currentDataRef = useRef<CandlestickData[]>([]);

  // Helper function to determine decimal places for price
  const getPriceDecimals = (price: number): number => {
    if (price === 0) return 8;
    if (price < 0.000001) return 10;
    if (price < 0.00001) return 9;
    if (price < 0.0001) return 8;
    if (price < 0.001) return 7;
    if (price < 0.01) return 6;
    if (price < 0.1) return 5;
    if (price < 1) return 4;
    if (price < 10) return 3;
    return 2;
  };

  // Helper function to format price with proper decimals
  const formatPrice = (price: number): string => {
    const decimals = getPriceDecimals(price);
    return price.toFixed(decimals);
  };

  // Handle live swap updates
  const handleLiveSwap = (swap: SwapEvent) => {
    console.log("💹 Live swap received:", swap);

    setCurrentPrice(swap.price);
    setLiveSwapIndicator(swap);

    // Clear indicator after 3 seconds
    setTimeout(() => {
      setLiveSwapIndicator(null);
    }, 3000);

    // Update chart with new price
    if (seriesRef.current && currentDataRef.current.length > 0) {
      const lastCandle = currentDataRef.current[currentDataRef.current.length - 1];
      const currentTime = Math.floor(swap.timestamp) as UTCTimestamp;

      // Check if we need to create a new candle or update the existing one
      const timeDiff = currentTime - (lastCandle.time as number);
      const candleInterval = getTimeframeSeconds(timeframe);

      if (timeDiff >= candleInterval) {
        // Create new candle
        const newCandle: CandlestickData = {
          time: currentTime,
          open: swap.price,
          high: swap.price,
          low: swap.price,
          close: swap.price,
        };
        currentDataRef.current.push(newCandle);
        (seriesRef.current as ISeriesApi<"Candlestick">).update(newCandle);
      } else {
        // Update current candle
        const updatedCandle: CandlestickData = {
          time: lastCandle.time,
          open: lastCandle.open,
          high: Math.max(lastCandle.high, swap.price),
          low: Math.min(lastCandle.low, swap.price),
          close: swap.price,
        };
        currentDataRef.current[currentDataRef.current.length - 1] = updatedCandle;
        (seriesRef.current as ISeriesApi<"Candlestick">).update(updatedCandle);
      }
    }
  };

  const getTimeframeSeconds = (tf: Timeframe): number => {
    const map: Record<Timeframe, number> = {
      "5M": 5 * 60,
      "15M": 15 * 60,
      "1H": 60 * 60,
      "4H": 4 * 60 * 60,
      "1D": 24 * 60 * 60,
      "1W": 7 * 24 * 60 * 60,
    };
    return map[tf];
  };

  // WebSocket subscription effect
  useEffect(() => {
    if (!tokenAddress) return;

    const setupWebSocket = async () => {
      try {
        const pairAddress = await findTokenPair(tokenAddress);
        if (!pairAddress) return;

        const reserves = await getPairReserves(pairAddress);
        const isToken0 = reserves.token0.toLowerCase() === tokenAddress.toLowerCase();

        const wsService = getWebSocketService();
        await wsService.connect();

        console.log("🔌 Subscribing to live swaps...");
        await wsService.subscribeToSwaps(tokenAddress, pairAddress, isToken0, handleLiveSwap);
        setIsLive(true);

      } catch (error) {
        console.error("Failed to setup WebSocket:", error);
        setIsLive(false);
      }
    };

    setupWebSocket();

    return () => {
      if (tokenAddress) {
        findTokenPair(tokenAddress).then(pairAddress => {
          if (pairAddress) {
            getWebSocketService().unsubscribe(tokenAddress, pairAddress);
          }
        });
      }
      setIsLive(false);
    };
  }, [tokenAddress]);

  // Chart setup and data loading effect
  useEffect(() => {
    if (!chartContainerRef.current || !tokenAddress) return;

    // Create chart with dynamic precision
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#0a0e1a" },
        textColor: "#d1d4dc",
      },
      grid: {
        vertLines: { color: "#1e2639" },
        horzLines: { color: "#1e2639" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 600,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "#1e2639",
      },
      rightPriceScale: {
        borderColor: "#1e2639",
        autoScale: true,
        mode: 0, // Normal mode
      },
      crosshair: {
        vertLine: {
          color: "#758696",
          width: 1,
          style: 1,
          labelBackgroundColor: "#3b82f6",
        },
        horzLine: {
          color: "#758696",
          width: 1,
          style: 1,
          labelBackgroundColor: "#3b82f6",
        },
      },
      localization: {
        priceFormatter: (price: number) => {
          return formatPrice(price);
        },
      },
    });

    chartRef.current = chart;

    // Load chart data
    const loadChartData = async () => {
      setLoading(true);
      try {
        const data = await fetchChartData(tokenAddress, timeframe);

        if (data.length === 0) {
          setLoading(false);
          return;
        }

        // Calculate price change
        const change = calculatePriceChange(data);
        setPriceChange(change);

        const lastCandle = data[data.length - 1];
        const price = lastCandle.close || lastCandle.value || 0;
        setCurrentPrice(price);

        // Set price scale precision based on price
        const decimals = getPriceDecimals(price);
        chart.priceScale("right").applyOptions({
          autoScale: true,
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        });

        if (chartType === "candlestick") {
          const candlestickSeries = chart.addCandlestickSeries({
            upColor: "#10b981",
            downColor: "#ef4444",
            borderVisible: false,
            wickUpColor: "#10b981",
            wickDownColor: "#ef4444",
            priceFormat: {
              type: "price",
              precision: decimals,
              minMove: 1 / Math.pow(10, decimals),
            },
          });

          const candleData: CandlestickData[] = data
            .filter(d => d.open !== undefined)
            .map(d => ({
              time: d.time as UTCTimestamp,
              open: d.open!,
              high: d.high!,
              low: d.low!,
              close: d.close!,
            }));

          candlestickSeries.setData(candleData);
          seriesRef.current = candlestickSeries;
          currentDataRef.current = candleData;
        } else {
          const lineSeries = chart.addLineSeries({
            color: "#3b82f6",
            lineWidth: 2,
            priceFormat: {
              type: "price",
              precision: decimals,
              minMove: 1 / Math.pow(10, decimals),
            },
          });

          const lineData: LineData[] = data.map(d => ({
            time: d.time as UTCTimestamp,
            value: d.close || d.value || 0,
          }));

          lineSeries.setData(lineData);
          seriesRef.current = lineSeries;
        }

        chart.timeScale().fitContent();
      } catch (error) {
        console.error("Error loading chart data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadChartData();

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (chartRef.current) {
        chart.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [chartType, timeframe, tokenAddress]);

  const timeframes: Timeframe[] = ["5M", "15M", "1H", "4H", "1D", "1W"];

  return (
    <div className="flex-1 flex flex-col bg-[#131925] border-b border-[#1e2639]">
      {/* Price Header */}
      {tokenAddress && (
        <div className="px-4 py-3 border-b border-[#1e2639]">
          <div className="flex items-baseline gap-4">
            <div className="text-3xl font-bold">
              ${formatPrice(currentPrice)}
            </div>
            {priceChange.changePercent !== 0 && (
              <div className={`flex items-center gap-1 text-lg ${
                priceChange.changePercent >= 0 ? "text-green-500" : "text-red-500"
              }`}>
                <span>{priceChange.changePercent >= 0 ? "▲" : "▼"}</span>
                <span>{Math.abs(priceChange.changePercent).toFixed(2)}%</span>
                <span className="text-sm">
                  (${formatPrice(Math.abs(priceChange.change))})
                </span>
              </div>
            )}
            <div className="text-sm text-gray-400 ml-auto flex items-center gap-3">
              <span>{timeframe} Chart</span>
              {isLive && (
                <span className="flex items-center gap-1.5 text-green-500 font-medium">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                  </span>
                  LIVE
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Live Swap Indicator */}
      {liveSwapIndicator && (
        <div className={`px-4 py-2 border-b transition-all ${
          liveSwapIndicator.type === "buy"
            ? "bg-green-500/20 border-green-500/50"
            : "bg-red-500/20 border-red-500/50"
        }`}>
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold">
              🔥 {liveSwapIndicator.type === "buy" ? "BUY" : "SELL"} ${formatPrice(liveSwapIndicator.price)}
            </span>
            <span className="text-gray-300">
              Amount: {liveSwapIndicator.amount}
            </span>
          </div>
        </div>
      )}

      {/* Chart Controls */}
      <div className="px-4 py-3 border-b border-[#1e2639] flex items-center justify-between">
        <div className="flex gap-2">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              disabled={!tokenAddress}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
                timeframe === tf
                  ? "bg-blue-500 text-white"
                  : "bg-[#0a0e1a] text-gray-400 hover:text-white hover:bg-[#1e2639]"
              } ${!tokenAddress ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setChartType("candlestick")}
            disabled={!tokenAddress}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
              chartType === "candlestick"
                ? "bg-blue-500 text-white"
                : "bg-[#0a0e1a] text-gray-400 hover:text-white hover:bg-[#1e2639]"
            } ${!tokenAddress ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            📊 Candlestick
          </button>
          <button
            onClick={() => setChartType("line")}
            disabled={!tokenAddress}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-all ${
              chartType === "line"
                ? "bg-blue-500 text-white"
                : "bg-[#0a0e1a] text-gray-400 hover:text-white hover:bg-[#1e2639]"
            } ${!tokenAddress ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            📈 Line
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 p-4 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0e1a]/80 z-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-2"></div>
              <div className="text-gray-400">Loading chart data...</div>
            </div>
          </div>
        )}
        {!tokenAddress ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <div className="text-5xl mb-4">📊</div>
              <div className="text-xl mb-2">Search for a token to view its chart</div>
              <div className="text-sm">Enter a token address in the search bar above</div>
            </div>
          </div>
        ) : (
          <div ref={chartContainerRef} className="w-full h-full" />
        )}
      </div>
    </div>
  );
}
