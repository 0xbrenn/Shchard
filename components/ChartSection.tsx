"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, IChartApi } from "lightweight-charts";

interface ChartSectionProps {
  tokenAddress: string | null;
}

export default function ChartSection({ tokenAddress }: ChartSectionProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [timeframe, setTimeframe] = useState("1H");
  const [chartType, setChartType] = useState<"candlestick" | "line">("candlestick");

  useEffect(() => {
    if (!chartContainerRef.current) return;

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
      height: 500,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Generate sample data
    const generateSampleData = () => {
      const data = [];
      const now = Date.now() / 1000;
      let price = 100;

      for (let i = 100; i > 0; i--) {
        const time = now - i * 3600;
        const change = (Math.random() - 0.5) * 5;
        price += change;

        if (chartType === "candlestick") {
          data.push({
            time: time as any,
            open: price,
            high: price + Math.random() * 2,
            low: price - Math.random() * 2,
            close: price + (Math.random() - 0.5) * 1,
          });
        } else {
          data.push({
            time: time as any,
            value: price,
          });
        }
      }
      return data;
    };

    if (chartType === "candlestick") {
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: "#10b981",
        downColor: "#ef4444",
        borderVisible: false,
        wickUpColor: "#10b981",
        wickDownColor: "#ef4444",
      });
      candlestickSeries.setData(generateSampleData() as any);
    } else {
      const lineSeries = chart.addLineSeries({
        color: "#3b82f6",
        lineWidth: 2,
      });
      lineSeries.setData(generateSampleData() as any);
    }

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [chartType, timeframe, tokenAddress]);

  const timeframes = ["5M", "15M", "1H", "4H", "1D", "1W"];

  return (
    <div className="bg-[#131925] border-b border-[#1e2639] p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2">
          {timeframes.map((tf) => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 rounded text-sm ${
                timeframe === tf
                  ? "bg-blue-500 text-white"
                  : "bg-[#0a0e1a] text-gray-400 hover:text-white"
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setChartType("candlestick")}
            className={`px-3 py-1 rounded text-sm ${
              chartType === "candlestick"
                ? "bg-blue-500 text-white"
                : "bg-[#0a0e1a] text-gray-400 hover:text-white"
            }`}
          >
            Candlestick
          </button>
          <button
            onClick={() => setChartType("line")}
            className={`px-3 py-1 rounded text-sm ${
              chartType === "line"
                ? "bg-blue-500 text-white"
                : "bg-[#0a0e1a] text-gray-400 hover:text-white"
            }`}
          >
            Line
          </button>
        </div>
      </div>

      <div ref={chartContainerRef} className="w-full" />
    </div>
  );
}
