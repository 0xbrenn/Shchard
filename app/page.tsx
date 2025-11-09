"use client";

import { useRouter } from "next/navigation";
import { DEX_CONTRACTS } from "@/lib/config";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";

export default function Home() {
  const router = useRouter();

  const handleTokenSelect = (address: string) => {
    router.push(`/token/${address}`);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header onTokenSelect={handleTokenSelect} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar selectedToken={null} onTokenSelect={handleTokenSelect} />

        {/* Main welcome area */}
        <div className="flex-1 flex items-center justify-center glass-strong">
          <div className="text-center space-y-6 max-w-2xl px-8">
            <h1 className="text-6xl font-bold gradient-text mb-4">
              Shchard
            </h1>
            <p className="text-2xl text-gray-300">
              OPN Chain DEX Analytics Platform
            </p>
            <p className="text-lg text-gray-400">
              Real-time charting, trading analytics, and market insights for OPN Chain tokens
            </p>

            <div className="pt-8 space-y-4">
              <button
                onClick={() => handleTokenSelect(DEX_CONTRACTS.WOPN)}
                className="w-full max-w-md mx-auto block btn-gradient px-8 py-4 rounded-xl text-lg font-semibold card-hover glow-purple"
              >
                View WOPN Chart →
              </button>

              <p className="text-sm text-gray-500">
                Or search for any token address using the search bar above
              </p>
            </div>

            <div className="grid grid-cols-3 gap-6 pt-12">
              <div className="glass p-6 rounded-xl border border-[rgba(236,72,153,0.3)]">
                <div className="text-3xl mb-2">📊</div>
                <h3 className="font-semibold text-purple-400 mb-2">Real-Time Charts</h3>
                <p className="text-sm text-gray-400">Live price action with TradingView charts</p>
              </div>

              <div className="glass p-6 rounded-xl border border-[rgba(139,92,246,0.3)]">
                <div className="text-3xl mb-2">⚡</div>
                <h3 className="font-semibold text-blue-400 mb-2">Live Swaps</h3>
                <p className="text-sm text-gray-400">WebSocket-powered real-time transactions</p>
              </div>

              <div className="glass p-6 rounded-xl border border-[rgba(59,130,246,0.3)]">
                <div className="text-3xl mb-2">🎯</div>
                <h3 className="font-semibold text-pink-400 mb-2">Advanced Analytics</h3>
                <p className="text-sm text-gray-400">Volume, liquidity, and price metrics</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
