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

        {/* Main Chart and Data Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Chart Area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <ChartSection tokenAddress={selectedToken} />
          </div>

          {/* Right: Token Info and Transactions */}
          <div className="w-96 flex flex-col overflow-hidden bg-[#131925] border-l border-[#1e2639]">
            {/* Token Info - Fixed height */}
            <div className="flex-shrink-0 overflow-y-auto">
              <TokenInfo tokenAddress={selectedToken} />
            </div>

            {/* Transactions - Takes remaining space */}
            <div className="flex-1 overflow-hidden">
              <TransactionList tokenAddress={selectedToken} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
