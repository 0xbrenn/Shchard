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

  // Helper to safely convert to number
  const toNumber = (value: any): number => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? 0 : num;
  };

  // Helper to format price with proper decimals
  const formatPrice = (price: number | string): string => {
    const p = toNumber(price);
    if (p === 0) return "$0.00";
    if (p < 0.000001) return `$${p.toFixed(10)}`;
    if (p < 0.00001) return `$${p.toFixed(9)}`;
    if (p < 0.0001) return `$${p.toFixed(8)}`;
    if (p < 0.001) return `$${p.toFixed(7)}`;
    if (p < 0.01) return `$${p.toFixed(6)}`;
    if (p < 0.1) return `$${p.toFixed(5)}`;
    if (p < 1) return `$${p.toFixed(4)}`;
    if (p < 10) return `$${p.toFixed(3)}`;
    return `$${p.toFixed(2)}`;
  };

  // Helper to format token amount
  const formatTokenAmount = (amount: number | string): string => {
    const a = toNumber(amount);
    return a.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  // Helper to format volume
  const formatVolume = (volume: number | string): string => {
    const v = toNumber(volume);
    return `$${v.toFixed(2)}`;
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
          {/* Desktop Table View */}
          <div className="hidden md:block h-full">
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
                    <div className="font-medium data-number">{formatTokenAmount(tx.tokenAmount)}</div>
                    <div className="text-xs" style={{color: 'var(--text-tertiary)'}}>tokens</div>
                  </div>

                  {/* Price */}
                  <div className="text-right flex flex-col justify-center">
                    <div className="font-medium data-number" style={{color: 'var(--color-info)'}}>{formatPrice(tx.price)}</div>
                    <div className="text-xs" style={{color: 'var(--text-tertiary)'}}>per token</div>
                  </div>

                  {/* Total Value */}
                  <div className="text-right flex flex-col justify-center">
                    <div className="font-bold text-white data-number">{formatVolume(tx.volume)}</div>
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

          {/* Mobile Card View */}
          <div className="md:hidden overflow-y-auto h-full px-3 py-2">
            {transactions.map((tx, index) => (
              <a
                key={`${tx.txHash}-${index}`}
                href={`${OPN_CHAIN_CONFIG.explorerUrl}/tx/${tx.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`block mb-3 p-3 glass hover:border-[rgba(139,92,246,0.5)] border border-transparent rounded-lg transition-all active:scale-98 ${
                  newTxHighlight === tx.txHash ? "glow-purple animate-pulse" : ""
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <span
                    className={`px-2.5 py-1 rounded text-xs font-bold ${
                      tx.type === "buy"
                        ? "badge-positive"
                        : "badge-negative"
                    }`}
                  >
                    {tx.type === "buy" ? "BUY" : "SELL"}
                  </span>
                  <div className="text-xs text-gray-400">
                    {formatDistanceToNow(new Date(tx.timestamp * 1000), { addSuffix: true })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-gray-400">Price</div>
                    <div className="font-medium text-cyan-400">{formatPrice(tx.price)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">Total</div>
                    <div className="font-bold text-white">{formatVolume(tx.volume)}</div>
                  </div>
                </div>

                <div className="mt-2 text-xs text-gray-500 flex items-center justify-between">
                  <span>{formatTokenAmount(tx.tokenAmount)} tokens</span>
                  <span>{new Date(tx.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
