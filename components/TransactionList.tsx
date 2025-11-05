"use client";

import { formatDistanceToNow } from "date-fns";

interface TransactionListProps {
  tokenAddress: string | null;
}

interface Transaction {
  type: "buy" | "sell";
  amount: string;
  price: string;
  total: string;
  timestamp: Date;
  txHash: string;
}

export default function TransactionList({ tokenAddress }: TransactionListProps) {
  // Sample transaction data
  const transactions: Transaction[] = [
    {
      type: "buy",
      amount: "1,234.56",
      price: "$1.234",
      total: "$1,523.45",
      timestamp: new Date(Date.now() - 120000),
      txHash: "0x1234...5678",
    },
    {
      type: "sell",
      amount: "987.65",
      price: "$1.230",
      total: "$1,214.81",
      timestamp: new Date(Date.now() - 300000),
      txHash: "0xabcd...efgh",
    },
    {
      type: "buy",
      amount: "2,345.67",
      price: "$1.228",
      total: "$2,880.48",
      timestamp: new Date(Date.now() - 480000),
      txHash: "0x9876...5432",
    },
    {
      type: "buy",
      amount: "567.89",
      price: "$1.225",
      total: "$695.66",
      timestamp: new Date(Date.now() - 720000),
      txHash: "0xfedc...ba98",
    },
  ];

  return (
    <div className="bg-[#131925] border border-[#1e2639] rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">Recent Transactions</h3>

      {tokenAddress ? (
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
              <div
                key={index}
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
              </div>
            ))}
          </div>

          <div className="pt-2 border-t border-[#1e2639]">
            <button className="w-full text-center text-sm text-blue-500 hover:text-blue-400">
              View all transactions
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center text-gray-400 py-8">
          Search for a token to view transactions
        </div>
      )}
    </div>
  );
}
