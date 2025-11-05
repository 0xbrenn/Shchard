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
        const txs = await fetchTokenTransactions(tokenAddress, 20);
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
          setTransactions(prev => [newTx, ...prev.slice(0, 19)]);

          // Highlight new transaction
          setNewTxHighlight(swap.txHash);
          setTimeout(() => setNewTxHighlight(null), 3000);
        };

        // Subscribe to swaps (reuse the same WebSocket connection)
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
    <div className="h-full flex flex-col bg-[#131925] p-4">
      <h3 className="text-lg font-semibold mb-4">Recent Transactions</h3>

      {!tokenAddress ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="text-4xl mb-2">📋</div>
            <div>Search for a token to view transactions</div>
          </div>
        </div>
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
            <div>Loading transactions...</div>
          </div>
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="text-4xl mb-2">📭</div>
            <div>No transactions found</div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="grid grid-cols-3 gap-2 text-xs text-gray-400 pb-2 border-b border-[#1e2639]">
            <div>Type</div>
            <div className="text-right">Amount</div>
            <div className="text-right">Time</div>
          </div>

          <div className="flex-1 overflow-y-auto mt-2">
            {transactions.map((tx, index) => (
              <a
                key={index}
                href={`${OPN_CHAIN_CONFIG.explorerUrl}/tx/${tx.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`grid grid-cols-3 gap-2 text-sm py-3 hover:bg-[#0a0e1a] rounded px-2 -mx-2 cursor-pointer transition-all border-b border-[#1e2639]/50 ${
                  newTxHighlight === tx.txHash ? "bg-blue-500/20 animate-pulse" : ""
                }`}
              >
                <div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-bold ${
                      tx.type === "buy"
                        ? "bg-green-500/20 text-green-500"
                        : "bg-red-500/20 text-red-500"
                    }`}
                  >
                    {tx.type.toUpperCase()}
                  </span>
                  <div className="text-xs text-gray-500 mt-1">
                    {tx.total}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium">{tx.amount}</div>
                  <div className="text-xs text-gray-500">{tx.price}</div>
                </div>
                <div className="text-right text-gray-400 text-xs">
                  {formatDistanceToNow(tx.timestamp, { addSuffix: true })}
                </div>
              </a>
            ))}
          </div>

          <div className="pt-3 mt-3 border-t border-[#1e2639]">
            <a
              href={`${OPN_CHAIN_CONFIG.explorerUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center text-sm text-blue-500 hover:text-blue-400 py-2 bg-blue-500/10 rounded transition-colors"
            >
              View on Explorer →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
