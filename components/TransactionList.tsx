"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { fetchTokenTransactions } from "@/lib/tokenService";
import { Transaction } from "@/lib/types";
import { OPN_CHAIN_CONFIG } from "@/lib/config";

interface TransactionListProps {
  tokenAddress: string | null;
}

export default function TransactionList({ tokenAddress }: TransactionListProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);

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
                className="grid grid-cols-3 gap-2 text-sm py-3 hover:bg-[#0a0e1a] rounded px-2 -mx-2 cursor-pointer transition-colors border-b border-[#1e2639]/50"
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
