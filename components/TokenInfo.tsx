"use client";

import { useState, useEffect } from "react";
import { fetchTokenInfo } from "@/lib/backendService";
import { OPN_CHAIN_CONFIG } from "@/lib/config";

interface TokenInfoProps {
  tokenAddress: string | null;
}

export default function TokenInfo({ tokenAddress }: TokenInfoProps) {
  const [tokenData, setTokenData] = useState<{ price: number; volume24h: number; lastUpdate: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokenAddress) {
      setTokenData(null);
      return;
    }

    const loadTokenData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchTokenInfo(tokenAddress);
        setTokenData(data);
      } catch (err) {
        setError("Failed to load token data");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadTokenData();

    // Refresh every 30 seconds
    const interval = setInterval(loadTokenData, 30000);
    return () => clearInterval(interval);
  }, [tokenAddress]);

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    // Simple visual feedback without alert
    const btn = document.activeElement as HTMLButtonElement;
    if (btn) {
      const originalText = btn.textContent;
      btn.textContent = "Copied!";
      setTimeout(() => {
        btn.textContent = originalText;
      }, 1000);
    }
  };

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

  return (
    <div className="glass-strong px-6 py-3 border-b border-[rgba(139,92,246,0.2)]">
      {!tokenAddress ? (
        <div className="text-center text-gray-400 py-4 text-sm">
          Search for a token to view details
        </div>
      ) : loading ? (
        <div className="text-center text-gray-400 py-4 flex items-center justify-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-500"></div>
          <span className="text-sm">Loading...</span>
        </div>
      ) : error || !tokenData ? (
        <div className="text-center text-red-400 py-4 text-sm">
          {error || "No data available"}
        </div>
      ) : (
        <>
          {/* Desktop Layout */}
          <div className="hidden md:flex items-center justify-between gap-6">
            {/* Token Address (Shortened) */}
            <div className="flex items-center gap-4">
              <div>
                <div className="text-xs text-gray-400">Token</div>
                <div className="font-mono text-sm text-gray-300">
                  {tokenAddress.slice(0, 6)}...{tokenAddress.slice(-4)}
                </div>
              </div>
              <div className="flex items-baseline gap-3">
                <div className="text-2xl font-bold gradient-text">
                  {formatPrice(tokenData.price)}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-6">
              {tokenData.volume24h > 0 && (
                <div>
                  <div className="text-xs text-gray-400">24h Volume</div>
                  <div className="font-semibold text-purple-400">
                    ${tokenData.volume24h.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs text-gray-400">Last Update</div>
                <div className="font-semibold text-blue-400">
                  {new Date(tokenData.lastUpdate * 1000).toLocaleTimeString()}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <a
                href={`${OPN_CHAIN_CONFIG.explorerUrl}/address/${tokenAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 btn-gradient rounded text-sm font-medium transition-all glow-purple"
              >
                View Token
              </a>
              <button
                onClick={() => handleCopyAddress(tokenAddress)}
                className="px-4 py-2 glass border border-[rgba(236,72,153,0.3)] hover:border-[#ec4899] rounded text-sm font-medium transition-all"
              >
                Copy Address
              </button>
            </div>
          </div>

          {/* Mobile Layout */}
          <div className="md:hidden flex flex-col gap-3">
            {/* Price and Token Info */}
            <div className="flex items-baseline justify-between">
              <div className="text-xl font-bold gradient-text">
                {formatPrice(tokenData.price)}
              </div>
              <div className="font-mono text-xs text-gray-400">
                {tokenAddress.slice(0, 6)}...{tokenAddress.slice(-4)}
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              {tokenData.volume24h > 0 && (
                <div>
                  <div className="text-xs text-gray-400">24h Volume</div>
                  <div className="text-sm font-semibold text-purple-400">
                    ${tokenData.volume24h.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs text-gray-400">Updated</div>
                <div className="text-sm font-semibold text-blue-400">
                  {new Date(tokenData.lastUpdate * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <a
                href={`${OPN_CHAIN_CONFIG.explorerUrl}/address/${tokenAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-3 py-2 btn-gradient rounded text-xs font-medium transition-all glow-purple text-center"
              >
                View Explorer
              </a>
              <button
                onClick={() => handleCopyAddress(tokenAddress)}
                className="flex-1 px-3 py-2 glass border border-[rgba(236,72,153,0.3)] hover:border-[#ec4899] rounded text-xs font-medium transition-all active:scale-95"
              >
                Copy
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
