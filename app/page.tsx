"use client";

import { useState } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import ChartSection from "@/components/ChartSection";
import TokenInfo from "@/components/TokenInfo";
import TransactionList from "@/components/TransactionList";

export default function Home() {
  const [selectedToken, setSelectedToken] = useState<string | null>(null);

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <Header onTokenSelect={setSelectedToken} />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar selectedToken={selectedToken} onTokenSelect={setSelectedToken} />

        {/* Main Area - Chart, Info, and Transactions */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top: Token Info (compact) */}
          <div className="flex-shrink-0">
            <TokenInfo tokenAddress={selectedToken} />
          </div>

          {/* Middle: Chart */}
          <div className="flex-1 overflow-hidden">
            <ChartSection tokenAddress={selectedToken} />
          </div>

          {/* Bottom: Transactions - Like Uniswap */}
          <div className="h-80 border-t border-[rgba(236,72,153,0.3)] overflow-hidden">
            <TransactionList tokenAddress={selectedToken} />
          </div>
        </div>
      </div>
    </div>
  );
}
