"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, IChartApi, CandlestickData, LineData } from "lightweight-charts";
import { fetchChartData, Timeframe, calculatePriceChange } from "@/lib/chartService";

interface ChartSectionProps {
  tokenAddress: string | null;
}

export default function ChartSection({ tokenAddress }: ChartSectionProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("1H");
  const [chartType, setChartType] = useState<"candlestick" | "line">("candlestick");
  const [loading, setLoading] = useState(false);
  const [priceChange, setPriceChange] = useState({ change: 0, changePercent: 0 });
  const [currentPrice, setCurrentPrice] = useState(0);

  useEffect(() => {
    if (!chartContainerRef.current || !tokenAddress) return;

    // Create chart
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
        setCurrentPrice(lastCandle.close || lastCandle.value || 0);

        if (chartType === "candlestick") {
          const candlestickSeries = chart.addCandlestickSeries({
            upColor: "#10b981",
            downColor: "#ef4444",
            borderVisible: false,
            wickUpColor: "#10b981",
            wickDownColor: "#ef4444",
          });

          const candleData: CandlestickData[] = data
            .filter(d => d.open !== undefined)
            .map(d => ({
              time: d.time as any,
              open: d.open!,
              high: d.high!,
              low: d.low!,
              close: d.close!,
            }));

          candlestickSeries.setData(candleData);
        } else {
          const lineSeries = chart.addLineSeries({
            color: "#3b82f6",
            lineWidth: 2,
          });

          const lineData: LineData[] = data.map(d => ({
            time: d.time as any,
            value: d.close || d.value || 0,
          }));

          lineSeries.setData(lineData);
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
              ${currentPrice.toFixed(6)}
            </div>
            {priceChange.changePercent !== 0 && (
              <div className={`flex items-center gap-1 text-lg ${
                priceChange.changePercent >= 0 ? "text-green-500" : "text-red-500"
              }`}>
                <span>{priceChange.changePercent >= 0 ? "▲" : "▼"}</span>
                <span>{Math.abs(priceChange.changePercent).toFixed(2)}%</span>
                <span className="text-sm">
                  (${Math.abs(priceChange.change).toFixed(6)})
                </span>
              </div>
            )}
            <div className="text-sm text-gray-400 ml-auto">
              {timeframe} Chart
            </div>
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
