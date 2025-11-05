"use client";

import { DEX_CONTRACTS } from "@/lib/config";

interface SidebarProps {
  selectedToken: string | null;
  onTokenSelect: (address: string) => void;
}

export default function Sidebar({ selectedToken, onTokenSelect }: SidebarProps) {
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

    // Show feedback
    const button = e.target as HTMLElement;
    const originalText = button.textContent;
    button.textContent = "Copied!";
    setTimeout(() => {
      button.textContent = originalText;
    }, 1000);
  };

  const handleTokenClick = (address: string) => {
    onTokenSelect(address);
  };

  return (
    <aside className="w-72 bg-[#131925] border-r border-[#1e2639] overflow-y-auto flex flex-col">
      <div className="p-4 flex-1">
        <h2 className="text-lg font-semibold mb-4">Available Tokens</h2>

        <div className="space-y-2">
          {sampleTokens.map((token, index) => (
            <div
              key={index}
              onClick={() => handleTokenClick(token.address)}
              className={`bg-[#0a0e1a] border rounded-lg p-3 transition-all cursor-pointer ${
                selectedToken?.toLowerCase() === token.address.toLowerCase()
                  ? "border-blue-500 ring-2 ring-blue-500/50"
                  : "border-[#1e2639] hover:border-blue-500"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-lg">{token.symbol}</span>
                <button
                  onClick={(e) => handleCopyAddress(token.address, e)}
                  className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded transition-colors"
                >
                  Copy
                </button>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm text-gray-400">{token.name}</span>
                <span className="text-xs text-gray-500 font-mono break-all">
                  {token.address}
                </span>
                <span className="text-xs text-gray-400 mt-1">
                  {token.info}
                </span>
              </div>
              {selectedToken?.toLowerCase() === token.address.toLowerCase() && (
                <div className="mt-2 pt-2 border-t border-[#1e2639]">
                  <span className="text-xs text-blue-400">✓ Currently Viewing</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-sm font-semibold text-blue-400 mb-2">
            Quick Start Guide
          </p>
          <ol className="text-xs text-gray-300 space-y-1.5 list-decimal list-inside">
            <li>Click on WOPN card above to view chart</li>
            <li>Or paste any token address in search</li>
            <li>View real-time prices and liquidity</li>
            <li>See recent swap transactions</li>
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
