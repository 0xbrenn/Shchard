"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, IChartApi, CandlestickData, LineData, ISeriesApi, UTCTimestamp } from "lightweight-charts";
import { fetchChartData as fetchBackendChartData, BackendWebSocket, SwapUpdate } from "@/lib/backendService";

type Timeframe = "1M" | "5M" | "15M" | "30M" | "1H" | "2H" | "4H" | "12H" | "1D";

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
  const [liveSwapIndicator, setLiveSwapIndicator] = useState<SwapUpdate["data"] | null>(null);
  const [isLive, setIsLive] = useState(false);
  const currentDataRef = useRef<CandlestickData[]>([]);
  const wsRef = useRef<BackendWebSocket | null>(null);

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

  // Handle live swap updates from backend
  const handleLiveSwap = (swapData: SwapUpdate) => {
    const swap = swapData.data;
    console.log("💹 Live swap received:", swap);

    setCurrentPrice(swap.price);
    setLiveSwapIndicator(swap);

    // Clear indicator after 3 seconds
    setTimeout(() => {
      setLiveSwapIndicator(null);
    }, 3000);

    // Update chart with new price
    if (seriesRef.current && currentDataRef.current.length > 0 && chartType === "candlestick") {
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
      "1M": 60,
      "5M": 5 * 60,
      "15M": 15 * 60,
      "30M": 30 * 60,
      "1H": 60 * 60,
      "2H": 2 * 60 * 60,
      "4H": 4 * 60 * 60,
      "12H": 12 * 60 * 60,
      "1D": 24 * 60 * 60,
    };
    return map[tf];
  };

  // WebSocket subscription effect
  useEffect(() => {
    if (!tokenAddress) return;

    // Initialize WebSocket connection to backend
    if (!wsRef.current) {
      wsRef.current = new BackendWebSocket();
    }

    // Subscribe to token updates
    console.log("🔌 Subscribing to live swaps via backend...");
    wsRef.current.subscribe(tokenAddress, handleLiveSwap);
    setIsLive(true);

    return () => {
      if (wsRef.current && tokenAddress) {
        wsRef.current.unsubscribe(tokenAddress);
      }
      setIsLive(false);
    };
  }, [tokenAddress]);

  // Chart setup and data loading effect
  useEffect(() => {
    if (!chartContainerRef.current || !tokenAddress) {
      console.log("⚠️ Chart container or token address missing", {
        hasContainer: !!chartContainerRef.current,
        tokenAddress
      });
      return;
    }

    console.log("📊 Initializing chart for:", tokenAddress);
    console.log("Container dimensions:", {
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight
    });

    // Create chart with TradingView-like professional styling
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#a3a3a3",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.04)" },
        horzLines: { color: "rgba(255, 255, 255, 0.04)" },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "rgba(255, 255, 255, 0.1)",
        barSpacing: 8,
        minBarSpacing: 4,
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        autoScale: true,
        mode: 0,
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      crosshair: {
        mode: 1, // Normal crosshair
        vertLine: {
          color: "rgba(236, 72, 153, 0.6)",
          width: 1,
          style: 2,
          labelBackgroundColor: "#ec4899",
        },
        horzLine: {
          color: "rgba(139, 92, 246, 0.6)",
          width: 1,
          style: 2,
          labelBackgroundColor: "#8b5cf6",
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      localization: {
        priceFormatter: (price: number) => {
          return formatPrice(price);
        },
      },
    });

    chartRef.current = chart;

    // Load chart data from backend
    const loadChartData = async () => {
      setLoading(true);
      try {
        const response = await fetchBackendChartData(tokenAddress, timeframe);

        if (!response || !response.candles || response.candles.length === 0) {
          console.log("No candle data available");
          setLoading(false);
          return;
        }

        console.log(`📊 Received ${response.candles.length} candles from backend`);
        console.log("First candle sample:", response.candles[0]);

        // Filter and validate candle data
        const candles = response.candles.filter(c => {
          if (!c || !c.time) {
            console.log("❌ Rejected candle: missing time", c);
            return false;
          }

          // For line chart, we only need close price
          if (chartType === 'line') {
            const valid = c.close != null && !isNaN(parseFloat(String(c.close)));
            if (!valid) console.log("❌ Rejected line candle:", c);
            return valid;
          }

          // For candlestick, we need all OHLC values
          const valid = c.open != null && !isNaN(parseFloat(String(c.open))) &&
                 c.high != null && !isNaN(parseFloat(String(c.high))) &&
                 c.low != null && !isNaN(parseFloat(String(c.low))) &&
                 c.close != null && !isNaN(parseFloat(String(c.close)));

          if (!valid) {
            console.log("❌ Rejected candlestick:", c);
          }
          return valid;
        }).map(c => ({
          ...c,
          time: typeof c.time === 'number' ? c.time : parseInt(String(c.time)),
          open: typeof c.open === 'number' ? c.open : parseFloat(String(c.open || 0)),
          high: typeof c.high === 'number' ? c.high : parseFloat(String(c.high || 0)),
          low: typeof c.low === 'number' ? c.low : parseFloat(String(c.low || 0)),
          close: typeof c.close === 'number' ? c.close : parseFloat(String(c.close)),
          volume: typeof c.volume === 'number' ? c.volume : parseFloat(String(c.volume || 0))
        }));

        if (candles.length === 0) {
          console.log("❌ No valid candle data after filtering");
          console.log("Chart type:", chartType);
          console.log("Original candles sample:", response.candles.slice(0, 3));
          setLoading(false);
          return;
        }

        console.log(`✅ Loaded ${candles.length} candles for ${chartType} chart`);

        // Check if chart still exists (might have been unmounted)
        if (!chartRef.current) {
          console.log("Chart was unmounted");
          setLoading(false);
          return;
        }

        // Remove old series if exists
        if (seriesRef.current && chartRef.current) {
          try {
            chartRef.current.removeSeries(seriesRef.current);
            seriesRef.current = null;
          } catch (e) {
            // Series might already be removed
          }
        }

        // Calculate price change
        const firstPrice = candles[0].open;
        const lastPrice = candles[candles.length - 1].close;
        const change = lastPrice - firstPrice;
        const changePercent = (change / firstPrice) * 100;
        setPriceChange({ change, changePercent });

        setCurrentPrice(lastPrice);

        // Set price scale precision based on price
        const decimals = getPriceDecimals(lastPrice);
        chartRef.current.priceScale("right").applyOptions({
          autoScale: true,
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        });

        if (chartType === "candlestick") {
          const candlestickSeries = chartRef.current.addCandlestickSeries({
            upColor: "#22c55e",
            downColor: "#ef4444",
            borderVisible: false,
            wickUpColor: "#22c55e",
            wickDownColor: "#ef4444",
            borderUpColor: "#22c55e",
            borderDownColor: "#ef4444",
            wickVisible: true,
            priceFormat: {
              type: "price",
              precision: decimals,
              minMove: 1 / Math.pow(10, decimals),
            },
          });

          const candleData: CandlestickData[] = candles.map(d => ({
            time: d.time as UTCTimestamp,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
          }));

          candlestickSeries.setData(candleData);
          seriesRef.current = candlestickSeries;
          currentDataRef.current = candleData;
        } else {
          const lineSeries = chartRef.current.addLineSeries({
            color: "#8b5cf6",
            lineWidth: 2,
            priceFormat: {
              type: "price",
              precision: decimals,
              minMove: 1 / Math.pow(10, decimals),
            },
          });

          const lineData: LineData[] = candles.map(d => ({
            time: d.time as UTCTimestamp,
            value: d.close,
          }));

          lineSeries.setData(lineData);
          seriesRef.current = lineSeries;
        }

        chartRef.current.timeScale().fitContent();
      } catch (error) {
        console.error("Error loading chart data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadChartData();

    // Improved resize handler with debouncing
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (chartContainerRef.current && chartRef.current) {
          chartRef.current.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          });
        }
      }, 100); // Debounce for 100ms
    };

    window.addEventListener("resize", handleResize);

    // Also observe container size changes (ResizeObserver)
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    if (chartContainerRef.current) {
      resizeObserver.observe(chartContainerRef.current);
    }

    return () => {
      clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [chartType, timeframe, tokenAddress]);

  const timeframes: Timeframe[] = ["1M", "5M", "15M", "30M", "1H", "2H", "4H", "12H", "1D"];

  // Time range zoom options (like TradingView)
  const handleTimeRange = (range: string) => {
    if (!chartRef.current) {
      console.log("⚠️ Chart not initialized, skipping time range change");
      return;
    }

    try {
      const timeScale = chartRef.current.timeScale();
      if (!timeScale) {
        console.log("⚠️ TimeScale not available");
        return;
      }

      const now = Math.floor(Date.now() / 1000);

      let from: number;
      switch (range) {
        case '1h': from = now - 3600; break;
        case '4h': from = now - 4 * 3600; break;
        case '1d': from = now - 24 * 3600; break;
        case '3d': from = now - 3 * 24 * 3600; break;
        case '1w': from = now - 7 * 24 * 3600; break;
        case '30d': from = now - 30 * 24 * 3600; break;
        case 'ALL':
          timeScale.fitContent();
          return;
        default: return;
      }

      timeScale.setVisibleRange({ from: from as UTCTimestamp, to: now as UTCTimestamp });
    } catch (error) {
      console.error("Error setting time range:", error);
    }
  };

  return (
    <div className="flex-1 flex flex-col glass-strong border-b border-[rgba(236,72,153,0.2)] h-full overflow-hidden">
      {/* Price Header */}
      {tokenAddress && (
        <div className="px-4 py-3 border-b border-[rgba(139,92,246,0.2)]">
          <div className="flex items-baseline gap-4">
            <div className="text-3xl font-bold gradient-text">
              ${formatPrice(currentPrice)}
            </div>
            {priceChange.changePercent !== 0 && (
              <div className={`flex items-center gap-1 text-lg ${
                priceChange.changePercent >= 0 ? "text-green-400" : "text-red-400"
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
                <span className="flex items-center gap-1.5 text-green-400 font-medium">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400"></span>
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
            ? "bg-green-500/20 border-green-500/50 glow-green"
            : "bg-red-500/20 border-red-500/50 glow-red"
        }`}>
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold">
              🔥 {liveSwapIndicator.type === "buy" ? "BUY" : "SELL"} ${formatPrice(liveSwapIndicator.price)}
            </span>
            <span className="text-gray-300">
              Vol: ${liveSwapIndicator.volume.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Chart Controls */}
      <div className="px-4 py-3 border-b border-[rgba(236,72,153,0.2)]">
        {/* Timeframe and Chart Type Controls */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
          {/* Timeframe buttons - horizontal scroll on mobile */}
          <div className="overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
            <div className="flex gap-2 min-w-max">
              {timeframes.map((tf) => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  disabled={!tokenAddress}
                  className={`flex-shrink-0 px-4 py-2 rounded text-sm font-medium transition-all min-w-[44px] min-h-[44px] md:min-h-0 md:py-1.5 md:px-3 ${
                    timeframe === tf
                      ? "btn-gradient text-white glow-purple"
                      : "glass text-gray-400 hover:text-white active:scale-95"
                  } ${!tokenAddress ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>

          {/* Chart type buttons */}
          <div className="flex gap-2">
            <button
              onClick={() => setChartType("candlestick")}
              disabled={!tokenAddress}
              className={`flex-1 md:flex-initial px-4 py-2 rounded text-sm font-medium transition-all min-h-[44px] md:min-h-0 md:py-1.5 md:px-3 ${
                chartType === "candlestick"
                  ? "btn-gradient text-white glow-pink"
                  : "glass text-gray-400 hover:text-white active:scale-95"
              } ${!tokenAddress ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              📊 Candlestick
            </button>
            <button
              onClick={() => setChartType("line")}
              disabled={!tokenAddress}
              className={`flex-1 md:flex-initial px-4 py-2 rounded text-sm font-medium transition-all min-h-[44px] md:min-h-0 md:py-1.5 md:px-3 ${
                chartType === "line"
                  ? "btn-gradient text-white glow-blue"
                  : "glass text-gray-400 hover:text-white active:scale-95"
              } ${!tokenAddress ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              📈 Line
            </button>
          </div>
        </div>

        {/* Time Range Zoom Controls - horizontal scroll on mobile */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
          <span className="text-xs text-gray-400 mr-2 flex-shrink-0">Time Range:</span>
          <div className="flex gap-2 min-w-max">
            {['1h', '4h', '1d', '3d', '1w', '30d', 'ALL'].map((range) => (
              <button
                key={range}
                onClick={() => handleTimeRange(range)}
                disabled={!tokenAddress}
                className={`flex-shrink-0 px-3 py-2 rounded text-xs font-medium transition-all glass text-gray-400 hover:text-white hover:border-glow active:scale-95 min-w-[44px] min-h-[44px] md:min-h-0 md:py-1 md:px-2.5 ${
                  !tokenAddress ? "opacity-50 cursor-not-allowed" : ""
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 relative glass" style={{ minHeight: '400px' }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center glass-strong z-10">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-2"></div>
              <div className="text-gray-400">Loading chart data...</div>
            </div>
          </div>
        )}
        {!tokenAddress ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400">
              <div className="text-5xl mb-4">📊</div>
              <div className="text-xl mb-2 gradient-text">Search for a token to view its chart</div>
              <div className="text-sm">Enter a token address in the search bar above</div>
            </div>
          </div>
        ) : (
          <div ref={chartContainerRef} className="absolute inset-0" />
        )}
      </div>
    </div>
  );
}
