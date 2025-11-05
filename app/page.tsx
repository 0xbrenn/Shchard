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
    <div className="min-h-screen flex flex-col">
      <Header onTokenSelect={setSelectedToken} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar selectedToken={selectedToken} />

        <main className="flex-1 flex flex-col overflow-hidden">
          <ChartSection tokenAddress={selectedToken} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
            <TokenInfo tokenAddress={selectedToken} />
            <TransactionList tokenAddress={selectedToken} />
          </div>
        </main>
      </div>
    </div>
  );
}
