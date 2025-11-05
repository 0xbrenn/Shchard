"use client";

import { useState, useEffect, useRef } from "react";
import { formatDistanceToNow } from "date-fns";
import { fetchChartData, BackendWebSocket, BackendTransaction, SwapUpdate } from "@/lib/backendService";
import { OPN_CHAIN_CONFIG } from "@/lib/config";

interface TransactionListProps {
  tokenAddress: string | null;
}

export default function TransactionList({ tokenAddress }: TransactionListProps) {
  const [transactions, setTransactions] = useState<BackendTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTxHighlight, setNewTxHighlight] = useState<string | null>(null);
  const wsRef = useRef<BackendWebSocket | null>(null);

  // Helper to format price with proper decimals
  const formatPrice = (price: number): string => {
    if (price === 0) return "$0.00";
    if (price < 0.000001) return `$${price.toFixed(10)}`;
    if (price < 0.00001) return `$${price.toFixed(9)}`;
    if (price < 0.0001) return `$${price.toFixed(8)}`;
    if (price < 0.001) return `$${price.toFixed(7)}`;
    if (price < 0.01) return `$${price.toFixed(6)}`;
    if (price < 0.1) return `$${price.toFixed(5)}`;
    if (price < 1) return `$${price.toFixed(4)}`;
    if (price < 10) return `$${price.toFixed(3)}`;
    return `$${price.toFixed(2)}`;
  };

  // Load historical transactions from backend
  useEffect(() => {
    if (!tokenAddress) {
      setTransactions([]);
      return;
    }

    const loadTransactions = async () => {
      setLoading(true);
      try {
        const response = await fetchChartData(tokenAddress, "1H");
        // Backend returns transactions newest first, so no need to reverse
        setTransactions(response.transactions || []);
      } catch (err) {
        console.error("Failed to load transactions:", err);
      } finally {
        setLoading(false);
      }
    };

    loadTransactions();
  }, [tokenAddress]);

  // Subscribe to real-time transactions via backend WebSocket
  useEffect(() => {
    if (!tokenAddress) return;

    // Initialize WebSocket connection to backend
    if (!wsRef.current) {
      wsRef.current = new BackendWebSocket();
    }

    const handleNewSwap = (swapUpdate: SwapUpdate) => {
      console.log("📋 New transaction received:", swapUpdate);

      const swap = swapUpdate.data;

      // Add to top of list (newest first)
      setTransactions(prev => [swap, ...prev.slice(0, 49)]);

      // Highlight new transaction
      setNewTxHighlight(swap.txHash);
      setTimeout(() => setNewTxHighlight(null), 3000);
    };

    // Subscribe to token updates
    wsRef.current.subscribe(tokenAddress, handleNewSwap);

    return () => {
      if (wsRef.current && tokenAddress) {
        wsRef.current.unsubscribe(tokenAddress);
      }
    };
  }, [tokenAddress]);

  return (
    <div className="h-full flex flex-col glass-strong">
      <div className="px-6 py-4 border-b flex items-center justify-between" style={{borderColor: 'var(--border-subtle)'}}>
        <h3 className="text-lg font-semibold gradient-text">Recent Transactions</h3>
        {tokenAddress && transactions.length > 0 && (
          <span className="text-sm" style={{color: 'var(--text-secondary)'}}>
            {transactions.length} swaps
          </span>
        )}
      </div>

      {!tokenAddress ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="text-5xl mb-3">📊</div>
            <div className="text-lg gradient-text">Select a token to view transactions</div>
          </div>
        </div>
      ) : loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500 mx-auto mb-3"></div>
            <div>Loading transactions...</div>
          </div>
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="text-5xl mb-3">📭</div>
            <div className="text-lg gradient-text">No transactions yet</div>
            <div className="text-sm mt-1">Make the first swap!</div>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          {/* Table Header */}
          <div className="px-6 py-3 grid grid-cols-6 gap-4 text-xs font-semibold border-b" style={{color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)'}}>
            <div>TYPE</div>
            <div className="col-span-2 text-right">AMOUNT</div>
            <div className="text-right">PRICE</div>
            <div className="text-right">TOTAL</div>
            <div className="text-right">TIME</div>
          </div>

          {/* Table Body */}
          <div className="overflow-y-auto" style={{ maxHeight: "calc(100% - 48px)" }}>
            {transactions.map((tx, index) => (
              <a
                key={`${tx.txHash}-${index}`}
                href={`${OPN_CHAIN_CONFIG.explorerUrl}/tx/${tx.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`px-6 py-4 grid grid-cols-6 gap-4 glass hover:border-[rgba(139,92,246,0.5)] border border-transparent transition-all cursor-pointer ${
                  newTxHighlight === tx.txHash ? "glow-purple animate-pulse" : ""
                }`}
              >
                {/* Type */}
                <div className="flex items-center">
                  <span
                    className={`px-3 py-1.5 rounded-md text-xs font-bold ${
                      tx.type === "buy"
                        ? "badge-positive"
                        : "badge-negative"
                    }`}
                  >
                    {tx.type === "buy" ? "BUY" : "SELL"}
                  </span>
                </div>

                {/* Token Amount */}
                <div className="col-span-2 text-right flex flex-col justify-center">
                  <div className="font-medium data-number">{tx.tokenAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</div>
                  <div className="text-xs" style={{color: 'var(--text-tertiary)'}}>tokens</div>
                </div>

                {/* Price */}
                <div className="text-right flex flex-col justify-center">
                  <div className="font-medium data-number" style={{color: 'var(--color-info)'}}>{formatPrice(tx.price)}</div>
                  <div className="text-xs" style={{color: 'var(--text-tertiary)'}}>per token</div>
                </div>

                {/* Total Value */}
                <div className="text-right flex flex-col justify-center">
                  <div className="font-bold text-white data-number">${tx.volume.toFixed(2)}</div>
                  <div className="text-xs" style={{color: 'var(--text-tertiary)'}}>total</div>
                </div>

                {/* Time */}
                <div className="text-right flex flex-col justify-center">
                  <div className="text-sm" style={{color: 'var(--text-secondary)'}}>
                    {formatDistanceToNow(new Date(tx.timestamp * 1000), { addSuffix: true })}
                  </div>
                  <div className="text-xs" style={{color: 'var(--text-tertiary)'}}>
                    {new Date(tx.timestamp * 1000).toLocaleTimeString()}
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
