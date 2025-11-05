"use client";

import { DEX_CONTRACTS } from "@/lib/config";

interface SidebarProps {
  selectedToken: string | null;
}

export default function Sidebar({ selectedToken }: SidebarProps) {
  // Display WOPN as the main token
  const sampleTokens = [
    {
      name: "Wrapped OPN",
      symbol: "WOPN",
      address: DEX_CONTRACTS.WOPN,
      info: "Native wrapped token"
    },
  ];

  const handleCopyAddress = (address: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(address);
  };

  return (
    <aside className="w-64 bg-[#131925] border-r border-[#1e2639] overflow-y-auto">
      <div className="p-4">
        <h2 className="text-lg font-semibold mb-4">Tokens</h2>

        <div className="space-y-2">
          {sampleTokens.map((token, index) => (
            <div
              key={index}
              className={`bg-[#0a0e1a] border rounded-lg p-3 transition-colors ${
                selectedToken?.toLowerCase() === token.address.toLowerCase()
                  ? "border-blue-500"
                  : "border-[#1e2639] hover:border-blue-500 cursor-pointer"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{token.symbol}</span>
                <button
                  onClick={(e) => handleCopyAddress(token.address, e)}
                  className="text-xs text-blue-500 hover:text-blue-400"
                >
                  Copy
                </button>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">{token.name}</span>
                <span className="text-xs text-gray-500 font-mono break-all">
                  {token.address.slice(0, 6)}...{token.address.slice(-4)}
                </span>
                <span className="text-xs text-gray-500">{token.info}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-xs text-blue-400 mb-2">
            To test the platform:
          </p>
          <ol className="text-xs text-gray-300 space-y-1 list-decimal list-inside">
            <li>Copy WOPN address above</li>
            <li>Paste it in the search bar</li>
            <li>Or use any token address with a WOPN pair</li>
          </ol>
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
