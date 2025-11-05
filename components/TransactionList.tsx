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
    <div className="bg-[#131925] border border-[#1e2639] rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">Recent Transactions</h3>

      {!tokenAddress ? (
        <div className="text-center text-gray-400 py-8">
          Search for a token to view transactions
        </div>
      ) : loading ? (
        <div className="text-center text-gray-400 py-8">
          Loading transactions...
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center text-gray-400 py-8">
          No transactions found
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-5 gap-2 text-xs text-gray-400 pb-2 border-b border-[#1e2639]">
            <div>Type</div>
            <div className="text-right">Amount</div>
            <div className="text-right">Price</div>
            <div className="text-right">Total</div>
            <div className="text-right">Time</div>
          </div>

          <div className="space-y-1 max-h-[300px] overflow-y-auto">
            {transactions.map((tx, index) => (
              <a
                key={index}
                href={`${OPN_CHAIN_CONFIG.explorerUrl}/tx/${tx.txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="grid grid-cols-5 gap-2 text-sm py-2 hover:bg-[#0a0e1a] rounded px-2 -mx-2 cursor-pointer"
              >
                <div>
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      tx.type === "buy"
                        ? "bg-green-500/20 text-green-500"
                        : "bg-red-500/20 text-red-500"
                    }`}
                  >
                    {tx.type.toUpperCase()}
                  </span>
                </div>
                <div className="text-right">{tx.amount}</div>
                <div className="text-right">{tx.price}</div>
                <div className="text-right font-medium">{tx.total}</div>
                <div className="text-right text-gray-400 text-xs">
                  {formatDistanceToNow(tx.timestamp, { addSuffix: true })}
                </div>
              </a>
            ))}
          </div>

          <div className="pt-2 border-t border-[#1e2639]">
            <a
              href={`${OPN_CHAIN_CONFIG.explorerUrl}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center text-sm text-blue-500 hover:text-blue-400"
            >
              View all transactions on explorer
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
