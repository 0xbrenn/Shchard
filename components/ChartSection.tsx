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
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
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
    console.log("   Current chart type:", chartType);
    console.log("   Series exists:", !!seriesRef.current);
    console.log("   Data length:", currentDataRef.current.length);

    setCurrentPrice(swap.price);
    setLiveSwapIndicator(swap);

    // Clear indicator after 3 seconds
    setTimeout(() => {
      setLiveSwapIndicator(null);
    }, 3000);

    // Update chart with new price
    if (!seriesRef.current || currentDataRef.current.length === 0) {
      console.log("⚠️ Chart not ready for updates");
      return;
    }

    const candleInterval = getTimeframeSeconds(timeframe);
    const swapCandleTime = Math.floor(swap.timestamp / candleInterval) * candleInterval;

    if (chartType === "candlestick") {
      const lastCandle = currentDataRef.current[currentDataRef.current.length - 1];
      const lastCandleTime = lastCandle.time as number;

      console.log(`📊 Candlestick update: swap at ${swap.timestamp} (${new Date(swap.timestamp * 1000).toISOString()})`);
      console.log(`   Swap candle time: ${swapCandleTime}, Last candle time: ${lastCandleTime}`);
      console.log(`   Swap price: ${swap.price}`);

      if (swapCandleTime > lastCandleTime) {
        // This swap belongs to a NEW candle period
        console.log("🆕 Creating new candle");

        // Fill any gaps between last candle and this new candle
        let fillTime = lastCandleTime + candleInterval;
        while (fillTime < swapCandleTime) {
          const gapCandle: CandlestickData = {
            time: fillTime as UTCTimestamp,
            open: lastCandle.close,
            high: lastCandle.close,
            low: lastCandle.close,
            close: lastCandle.close,
          };
          currentDataRef.current.push(gapCandle);
          (seriesRef.current as ISeriesApi<"Candlestick">).update(gapCandle);
          console.log(`  📋 Filled gap candle at ${fillTime}`);
          fillTime += candleInterval;
        }

        // Now create the candle with the actual swap
        const newCandle: CandlestickData = {
          time: swapCandleTime as UTCTimestamp,
          open: swap.price,
          high: swap.price,
          low: swap.price,
          close: swap.price,
        };
        currentDataRef.current.push(newCandle);
        (seriesRef.current as ISeriesApi<"Candlestick">).update(newCandle);
        console.log(`✅ New candle created at ${swapCandleTime} with price ${swap.price}`);
      } else if (swapCandleTime === lastCandleTime) {
        // This swap belongs to the CURRENT candle period - update it
        console.log("📝 Updating current candle");
        const updatedCandle: CandlestickData = {
          time: lastCandle.time,
          open: lastCandle.open,
          high: Math.max(lastCandle.high, swap.price),
          low: Math.min(lastCandle.low, swap.price),
          close: swap.price,
        };
        currentDataRef.current[currentDataRef.current.length - 1] = updatedCandle;
        (seriesRef.current as ISeriesApi<"Candlestick">).update(updatedCandle);
        console.log(`✅ Candle updated: O:${updatedCandle.open} H:${updatedCandle.high} L:${updatedCandle.low} C:${updatedCandle.close}`);
      } else {
        // This swap is for an old candle (shouldn't happen in real-time)
        console.log("⚠️ Swap belongs to old candle, ignoring");
      }
    } else if (chartType === "line") {
      // Update line chart
      console.log(`📈 Line chart update: adding point at ${swapCandleTime} with value ${swap.price}`);

      const newPoint: LineData = {
        time: swapCandleTime as UTCTimestamp,
        value: swap.price,
      };

      (seriesRef.current as ISeriesApi<"Line">).update(newPoint);
      console.log(`✅ Line chart updated with price ${swap.price}`);
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

  // Automatic candle advancement timer (advances candles even without swaps)
  useEffect(() => {
    if (!seriesRef.current || !currentDataRef.current.length || chartType !== "candlestick") return;

    const candleInterval = getTimeframeSeconds(timeframe);

    // Check every second if we need to advance to a new candle
    const timer = setInterval(() => {
      if (currentDataRef.current.length === 0) return;

      const lastCandle = currentDataRef.current[currentDataRef.current.length - 1];
      const now = Math.floor(Date.now() / 1000);
      const currentCandleTime = Math.floor(now / candleInterval) * candleInterval;
      const lastCandleTime = lastCandle.time as number;

      // If we've moved into a new candle period
      if (currentCandleTime > lastCandleTime) {
        console.log(`⏰ Timer: Advancing candle from ${lastCandleTime} to ${currentCandleTime}`);

        // Fill gaps between last candle and current time
        let fillTime = lastCandleTime + candleInterval;
        while (fillTime <= currentCandleTime) {
          const newCandle: CandlestickData = {
            time: fillTime as UTCTimestamp,
            open: lastCandle.close,
            high: lastCandle.close,
            low: lastCandle.close,
            close: lastCandle.close,
          };
          currentDataRef.current.push(newCandle);
          if (seriesRef.current) {
            (seriesRef.current as ISeriesApi<"Candlestick">).update(newCandle);
          }
          console.log(`  📋 Auto-created candle at ${fillTime}`);
          fillTime += candleInterval;
        }
      }
    }, 1000); // Check every second

    return () => clearInterval(timer);
  }, [timeframe, chartType, seriesRef.current, currentDataRef.current.length]);

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
        vertLines: {
          color: "rgba(255, 255, 255, 0.04)",
          style: 1, // Dotted lines
          visible: true,
        },
        horzLines: {
          color: "rgba(255, 255, 255, 0.06)",
          style: 1, // Dotted lines
          visible: true,
        },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: "rgba(255, 255, 255, 0.1)",
        barSpacing: 8,
        minBarSpacing: 4,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
        rightBarStaysOnScroll: true,
        borderVisible: true,
        visible: true,
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        autoScale: true,
        mode: 0, // Normal mode
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        borderVisible: true,
        visible: true,
        alignLabels: true,
        entireTextOnly: false,
      },
      crosshair: {
        mode: 1, // Magnet mode - snaps to data points
        vertLine: {
          color: "rgba(236, 72, 153, 0.8)",
          width: 1,
          style: 2, // Dashed
          labelBackgroundColor: "#ec4899",
          labelVisible: true,
          visible: true,
        },
        horzLine: {
          color: "rgba(139, 92, 246, 0.8)",
          width: 1,
          style: 2, // Dashed
          labelBackgroundColor: "#8b5cf6",
          labelVisible: true,
          visible: true,
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
        timeFormatter: (time: number) => {
          const date = new Date(time * 1000);
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        },
      },
      watermark: {
        visible: true,
        fontSize: 48,
        horzAlign: "center",
        vertAlign: "center",
        color: "rgba(236, 72, 153, 0.1)",
        text: "SHCHARD",
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

        // Remove old volume series if exists
        if (volumeSeriesRef.current && chartRef.current) {
          try {
            chartRef.current.removeSeries(volumeSeriesRef.current);
            volumeSeriesRef.current = null;
          } catch (e) {
            // Series might already be removed
          }
        }

        // Calculate price change
        const firstPrice = candles[0].open;

        // Use latest transaction price if available (more accurate than last candle)
        const latestPrice = response.transactions && response.transactions.length > 0
          ? response.transactions[0].price
          : candles[candles.length - 1].close;

        const change = latestPrice - firstPrice;
        const changePercent = (change / firstPrice) * 100;
        setPriceChange({ change, changePercent });

        setCurrentPrice(latestPrice);

        // Set price scale precision based on price
        const decimals = getPriceDecimals(latestPrice);
        chartRef.current.priceScale("right").applyOptions({
          autoScale: true,
          scaleMargins: {
            top: 0.1,
            bottom: 0.3, // More space for volume bars at bottom
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

          // Add price line marker for current price
          candlestickSeries.createPriceLine({
            price: latestPrice,
            color: latestPrice >= candles[0].open ? "#22c55e" : "#ef4444",
            lineWidth: 2,
            lineStyle: 2, // Dashed line
            axisLabelVisible: true,
            title: "Current",
          });
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

          // Add price line marker for current price
          lineSeries.createPriceLine({
            price: latestPrice,
            color: "#8b5cf6",
            lineWidth: 2,
            lineStyle: 2, // Dashed line
            axisLabelVisible: true,
            title: "Current",
          });
        }

        // Add volume histogram below the chart
        const volumeSeries = chartRef.current.addHistogramSeries({
          color: "#26a69a",
          priceFormat: {
            type: "volume",
          },
          priceScaleId: "", // Use separate scale for volume
        });

        volumeSeries.priceScale().applyOptions({
          scaleMargins: {
            top: 0.7, // Volume takes bottom 30% of chart
            bottom: 0,
          },
        });

        // Prepare volume data with color based on price direction
        const volumeData = candles.map((d, index) => {
          const isUp = index === 0 ? true : d.close >= candles[index - 1].close;
          return {
            time: d.time as UTCTimestamp,
            value: d.volume,
            color: isUp ? "rgba(34, 197, 94, 0.5)" : "rgba(239, 68, 68, 0.5)",
          };
        });

        volumeSeries.setData(volumeData);
        volumeSeriesRef.current = volumeSeries;

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
            <div className="text-xs text-gray-400 mb-2 md:hidden">Candle Interval:</div>
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
          <span className="text-xs text-gray-400 mr-2 flex-shrink-0">Zoom:</span>
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
