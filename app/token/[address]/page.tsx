"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import ChartSection from "@/components/ChartSection";
import TokenInfo from "@/components/TokenInfo";
import TransactionList from "@/components/TransactionList";

export default function TokenPage() {
  const params = useParams();
  const router = useRouter();
  const tokenAddress = params.address as string;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<'chart' | 'transactions'>('chart');

  const handleTokenSelect = (address: string) => {
    router.push(`/token/${address}`);
    setSidebarOpen(false); // Close sidebar on mobile after selection
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[var(--bg-primary)]">
      {/* Header - always visible */}
      <Header onTokenSelect={handleTokenSelect} />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar - Hidden on mobile, shows as drawer */}
        <div className={`
          fixed lg:relative inset-y-0 left-0 z-40
          transform ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0 transition-transform duration-300 ease-in-out
        `}>
          <Sidebar selectedToken={tokenAddress} onTokenSelect={handleTokenSelect} />
        </div>

        {/* Overlay for mobile sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Token Info - Compact on mobile */}
          <div className="flex-shrink-0">
            <TokenInfo tokenAddress={tokenAddress} />
          </div>

          {/* Desktop Layout: Chart + Transactions side by side vertically */}
          <div className="hidden md:flex md:flex-col flex-1 overflow-hidden">
            {/* Chart */}
            <div className="flex-1 overflow-hidden">
              <ChartSection tokenAddress={tokenAddress} />
            </div>

            {/* Transactions */}
            <div className="h-80 border-t border-[var(--border-subtle)] overflow-hidden">
              <TransactionList tokenAddress={tokenAddress} />
            </div>
          </div>

          {/* Mobile Layout: Tabs for Chart/Transactions */}
          <div className="md:hidden flex-1 flex flex-col overflow-hidden">
            {/* Mobile Tab Switcher */}
            <div className="flex border-b border-[var(--border-subtle)] bg-[var(--bg-card)]">
              <button
                onClick={() => setMobileTab('chart')}
                className={`flex-1 py-3 text-sm font-medium transition-all ${
                  mobileTab === 'chart'
                    ? 'text-white border-b-2 border-[var(--accent-primary)]'
                    : 'text-gray-400'
                }`}
              >
                📊 Chart
              </button>
              <button
                onClick={() => setMobileTab('transactions')}
                className={`flex-1 py-3 text-sm font-medium transition-all ${
                  mobileTab === 'transactions'
                    ? 'text-white border-b-2 border-[var(--accent-primary)]'
                    : 'text-gray-400'
                }`}
              >
                📋 Transactions
              </button>
            </div>

            {/* Mobile Content */}
            <div className="flex-1 overflow-hidden">
              {mobileTab === 'chart' ? (
                <ChartSection tokenAddress={tokenAddress} />
              ) : (
                <TransactionList tokenAddress={tokenAddress} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--bg-card)] border-t border-[var(--border-subtle)] safe-area-pb">
        <div className="flex items-center justify-around py-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="flex flex-col items-center gap-1 px-4 py-2 text-gray-400 active:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <span className="text-xs">Tokens</span>
          </button>
          <button
            onClick={() => setMobileTab('chart')}
            className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
              mobileTab === 'chart' ? 'text-[var(--accent-primary)]' : 'text-gray-400'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="text-xs">Chart</span>
          </button>
          <button
            onClick={() => setMobileTab('transactions')}
            className={`flex flex-col items-center gap-1 px-4 py-2 transition-colors ${
              mobileTab === 'transactions' ? 'text-[var(--accent-primary)]' : 'text-gray-400'
            }`}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span className="text-xs">Trades</span>
          </button>
        </div>
      </div>
    </div>
  );
}
