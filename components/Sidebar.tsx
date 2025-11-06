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
    <aside className="w-72 lg:w-72 h-full glass-strong border-r border-[rgba(236,72,153,0.3)] overflow-y-auto flex flex-col">
      <div className="p-4 flex-1 pb-safe">
        <h2 className="text-lg font-semibold mb-4 gradient-text">Available Tokens</h2>

        <div className="space-y-2">
          {sampleTokens.map((token, index) => (
            <div
              key={index}
              onClick={() => handleTokenClick(token.address)}
              className={`glass border rounded-lg p-3 transition-all cursor-pointer card-hover ${
                selectedToken?.toLowerCase() === token.address.toLowerCase()
                  ? "border-[#8b5cf6] ring-2 ring-[rgba(139,92,246,0.5)] glow-purple"
                  : "border-[rgba(236,72,153,0.3)] hover:border-[#ec4899]"
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-lg gradient-text">{token.symbol}</span>
                <button
                  onClick={(e) => handleCopyAddress(token.address, e)}
                  className="text-xs px-2 py-1 glass border border-[rgba(139,92,246,0.3)] text-purple-400 hover:border-[#8b5cf6] rounded transition-all"
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
                <div className="mt-2 pt-2 border-t border-[rgba(139,92,246,0.3)]">
                  <span className="text-xs text-purple-400">✓ Currently Viewing</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-6 p-3 glass border border-[rgba(59,130,246,0.4)] rounded-lg glow-blue">
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
            <button className="w-full text-left px-3 py-2 rounded glass hover:border-[rgba(236,72,153,0.3)] border border-transparent text-sm transition-all">
              Hot Pairs
            </button>
            <button className="w-full text-left px-3 py-2 rounded glass hover:border-[rgba(139,92,246,0.3)] border border-transparent text-sm transition-all">
              New Pairs
            </button>
            <button className="w-full text-left px-3 py-2 rounded glass hover:border-[rgba(59,130,246,0.3)] border border-transparent text-sm transition-all">
              Gainers
            </button>
            <button className="w-full text-left px-3 py-2 rounded glass hover:border-[rgba(236,72,153,0.3)] border border-transparent text-sm transition-all">
              Losers
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
