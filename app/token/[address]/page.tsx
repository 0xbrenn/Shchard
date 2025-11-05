"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import ChartSection from "@/components/ChartSection";
import TokenInfo from "@/components/TokenInfo";
import TransactionList from "@/components/TransactionList";

export default function TokenPage() {
  const params = useParams();
  const router = useRouter();
  const tokenAddress = params.address as string;

  const handleTokenSelect = (address: string) => {
    // Navigate to new token page
    router.push(`/token/${address}`);
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Header onTokenSelect={handleTokenSelect} />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar selectedToken={tokenAddress} onTokenSelect={handleTokenSelect} />

        {/* Main Area - Chart, Info, and Transactions */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top: Token Info (compact) */}
          <div className="flex-shrink-0">
            <TokenInfo tokenAddress={tokenAddress} />
          </div>

          {/* Middle: Chart */}
          <div className="flex-1 overflow-hidden">
            <ChartSection tokenAddress={tokenAddress} />
          </div>

          {/* Bottom: Transactions - Like Uniswap */}
          <div className="h-80 border-t border-[rgba(236,72,153,0.3)] overflow-hidden">
            <TransactionList tokenAddress={tokenAddress} />
          </div>
        </div>
      </div>
    </div>
  );
}
