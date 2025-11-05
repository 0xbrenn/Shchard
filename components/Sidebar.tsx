"use client";

interface SidebarProps {
  selectedToken: string | null;
}

export default function Sidebar({ selectedToken }: SidebarProps) {
  const trendingTokens = [
    { name: "WOPN", symbol: "WOPN", change: "+12.5%", price: "$0.45" },
    { name: "Token A", symbol: "TKA", change: "+8.2%", price: "$1.23" },
    { name: "Token B", symbol: "TKB", change: "-3.1%", price: "$0.89" },
    { name: "Token C", symbol: "TKC", change: "+15.7%", price: "$2.10" },
  ];

  return (
    <aside className="w-64 bg-[#131925] border-r border-[#1e2639] overflow-y-auto">
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-4">Trending</h2>

        <div className="space-y-2">
          {trendingTokens.map((token, index) => (
            <div
              key={index}
              className="bg-[#0a0e1a] border border-[#1e2639] rounded-lg p-3 hover:border-blue-500 cursor-pointer transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{token.symbol}</span>
                <span
                  className={`text-sm ${
                    token.change.startsWith("+")
                      ? "text-green-500"
                      : "text-red-500"
                  }`}
                >
                  {token.change}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">{token.name}</span>
                <span className="text-sm">{token.price}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-semibold mb-3 text-gray-400">
            Quick Links
          </h3>
          <div className="space-y-2">
            <button className="w-full text-left px-3 py-2 rounded hover:bg-[#0a0e1a] text-sm">
              Hot Pairs
            </button>
            <button className="w-full text-left px-3 py-2 rounded hover:bg-[#0a0e1a] text-sm">
              New Pairs
            </button>
            <button className="w-full text-left px-3 py-2 rounded hover:bg-[#0a0e1a] text-sm">
              Gainers
            </button>
            <button className="w-full text-left px-3 py-2 rounded hover:bg-[#0a0e1a] text-sm">
              Losers
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
