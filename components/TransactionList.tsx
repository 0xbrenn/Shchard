"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { fetchTokenTransactions } from "@/lib/tokenService";
import { Transaction } from "@/lib/types";
import { OPN_CHAIN_CONFIG } from "@/lib/config";
import { getWebSocketService, SwapEvent } from "@/lib/websocketService";
import { findTokenPair, getPairReserves } from "@/lib/web3";

interface TransactionListProps {
  tokenAddress: string | null;
}

export default function TransactionList({ tokenAddress }: TransactionListProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTxHighlight, setNewTxHighlight] = useState<string | null>(null);

  // Load historical transactions
  useEffect(() => {
    if (!tokenAddress) {
      setTransactions([]);
      return;
    }

    const loadTransactions = async () => {
      setLoading(true);
      try {
        const txs = await fetchTokenTransactions(tokenAddress, 50);
        setTransactions(txs);
      } catch (err) {
        console.error("Failed to load transactions:", err);
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, [tokenAddress]);

  // Subscribe to real-time transactions
  useEffect(() => {
    if (!tokenAddress) return;

    const setupLiveTransactions = async () => {
      try {
        const pairAddress = await findTokenPair(tokenAddress);
        if (!pairAddress) return;

        const reserves = await getPairReserves(pairAddress);
        const isToken0 = reserves.token0.toLowerCase() === tokenAddress.toLowerCase();

        const wsService = getWebSocketService();

        const handleNewSwap = (swap: SwapEvent) => {
          console.log("📋 New transaction received:", swap);

          // Create new transaction from swap
          const newTx: Transaction = {
            type: swap.type,
            amount: swap.amount,
            price: `$${swap.price.toFixed(8)}`,
            total: `$${(parseFloat(swap.amount) * swap.price).toFixed(2)}`,
            timestamp: new Date(swap.timestamp * 1000),
            txHash: swap.txHash,
            from: "",
            to: "",
          };

          // Add to top of list
          setTransactions(prev => [newTx, ...prev.slice(0, 49)]);

          // Highlight new transaction
          setNewTxHighlight(swap.txHash);
          setTimeout(() => setNewTxHighlight(null), 3000);
        };

        // Subscribe to swaps
        await wsService.subscribeToSwaps(tokenAddress, pairAddress, isToken0, handleNewSwap);

      } catch (error) {
        console.error("Failed to setup live transactions:", error);
      }
    };

    setupLiveTransactions();

    return () => {
      if (tokenAddress) {
        findTokenPair(tokenAddress).then(pairAddress => {
          if (pairAddress) {
            getWebSocketService().unsubscribe(tokenAddress, pairAddress);
          }
        });
      }
    };
  }, [tokenAddress]);

  return (
    <div className="h-full flex flex-col bg-[#131925]">
      <div className="px-6 py-4 border-b border-[#1e2639] flex items-center justify-between">
        <h3 className="text-lg font-semibold">Transactions</h3>
        {tokenAddress && transactions.length > 0 && (
          <span className="text-sm text-gray-400">
            {transactions.length} recent swaps
          </span>
        )}
      </div>

      {!tokenAddress ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="text-5xl mb-3">📊</div>
            <div className="text-lg">Select a token to view transactions</div>
          </div>
        </div>
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-3"></div>
            <div>Loading transactions...</div>
          </div>
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="text-5xl mb-3">📭</div>
            <div className="text-lg">No transactions yet</div>
            <div className="text-sm mt-1">Make the first swap!</div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          {/* Table Header */}
          <div className="px-6 py-3 grid grid-cols-6 gap-4 text-xs text-gray-400 font-semibold border-b border-[#1e2639]">
            <div>Type</div>
            <div className="col-span-2 text-right">Token Amount</div>
            <div className="text-right">Price (USD)</div>
            <div className="text-right">Total Value</div>
            <div className="text-right">Time</div>
          </div>

          {/* Table Body */}
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100% - 48px)" }}>
            {transactions.map((tx, index) => (
              <a
                key={`${tx.txHash}-${index}`}
                href={`${OPN_CHAIN_CONFIG.explorerUrl}/tx/${tx.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`px-6 py-4 grid grid-cols-6 gap-4 hover:bg-[#0a0e1a] transition-all border-b border-[#1e2639]/30 cursor-pointer ${
                  newTxHighlight === tx.txHash ? "bg-blue-500/20 animate-pulse" : ""
                }`}
              >
                {/* Type */}
                <div className="flex items-center">
                  <span
                    className={`px-3 py-1.5 rounded-md text-xs font-bold ${
                      tx.type === "buy"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {tx.type === "buy" ? "BUY" : "SELL"}
                  </span>
                </div>

                {/* Token Amount */}
                <div className="col-span-2 text-right flex flex-col justify-center">
                  <div className="font-medium">{tx.amount}</div>
                  <div className="text-xs text-gray-500">tokens</div>
                </div>

                {/* Price */}
                <div className="text-right flex flex-col justify-center">
                  <div className="font-medium">{tx.price}</div>
                  <div className="text-xs text-gray-500">per token</div>
                </div>

                {/* Total Value */}
                <div className="text-right flex flex-col justify-center">
                  <div className="font-bold text-white">{tx.total}</div>
                  <div className="text-xs text-gray-500">total</div>
                </div>

                {/* Time */}
                <div className="text-right flex flex-col justify-center">
                  <div className="text-sm">
                    {formatDistanceToNow(tx.timestamp, { addSuffix: true })}
                  </div>
                  <div className="text-xs text-gray-500">
                    {tx.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
