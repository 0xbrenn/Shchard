"use client";

import { useState, useEffect } from "react";
import { fetchTokenData } from "@/lib/tokenService";
import { TokenInfo as TokenInfoType } from "@/lib/types";
import { OPN_CHAIN_CONFIG } from "@/lib/config";

interface TokenInfoProps {
  tokenAddress: string | null;
}

export default function TokenInfo({ tokenAddress }: TokenInfoProps) {
  const [tokenData, setTokenData] = useState<TokenInfoType | null>(null);
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
        const data = await fetchTokenData(tokenAddress);
        setTokenData(data);
      } catch (err) {
        setError("Failed to load token data");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    loadTokenData();
  }, [tokenAddress]);

  const handleCopyAddress = (address: string, type: string) => {
    navigator.clipboard.writeText(address);
    alert(`${type} address copied to clipboard!`);
  };

  return (
    <div className="bg-[#131925] p-4 border-b border-[#1e2639]">
      <h3 className="text-lg font-semibold mb-4">Token Information</h3>

      {!tokenAddress ? (
        <div className="text-center text-gray-400 py-8">
          <div className="text-4xl mb-2">🔍</div>
          <div>Search for a token to view details</div>
        </div>
      ) : loading ? (
        <div className="text-center text-gray-400 py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <div>Loading token data...</div>
        </div>
      ) : error || !tokenData ? (
        <div className="text-center text-red-500 py-8">
          <div className="text-4xl mb-2">⚠️</div>
          <div>{error || "No data available for this token"}</div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Token Name and Symbol */}
          <div>
            <h4 className="text-2xl font-bold">{tokenData.token.name}</h4>
            <span className="text-lg text-gray-400">{tokenData.token.symbol}</span>
          </div>

          {/* Price Info */}
          <div className="p-3 bg-[#0a0e1a] rounded-lg">
            <div className="text-sm text-gray-400 mb-1">Current Price</div>
            <div className="text-3xl font-bold">
              ${tokenData.price.price.toFixed(6)}
            </div>
            {tokenData.price.priceChange24h !== 0 && (
              <div
                className={`text-base mt-1 ${
                  tokenData.price.priceChange24h >= 0
                    ? "text-green-500"
                    : "text-red-500"
                }`}
              >
                {tokenData.price.priceChange24h >= 0 ? "▲" : "▼"}
                {" "}{Math.abs(tokenData.price.priceChange24h).toFixed(2)}%
              </div>
            )}
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-[#0a0e1a] rounded-lg">
              <div className="text-gray-400 text-xs mb-1">Liquidity</div>
              <div className="font-bold text-lg">
                ${tokenData.price.liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            {tokenData.price.volume24h > 0 && (
              <div className="p-3 bg-[#0a0e1a] rounded-lg">
                <div className="text-gray-400 text-xs mb-1">24h Volume</div>
                <div className="font-bold text-lg">
                  ${tokenData.price.volume24h.toLocaleString()}
                </div>
              </div>
            )}
            {tokenData.price.marketCap > 0 && (
              <div className="p-3 bg-[#0a0e1a] rounded-lg">
                <div className="text-gray-400 text-xs mb-1">Market Cap</div>
                <div className="font-bold text-lg">
                  ${tokenData.price.marketCap.toLocaleString()}
                </div>
              </div>
            )}
            {tokenData.price.holders > 0 && (
              <div className="p-3 bg-[#0a0e1a] rounded-lg">
                <div className="text-gray-400 text-xs mb-1">Holders</div>
                <div className="font-bold text-lg">
                  {tokenData.price.holders.toLocaleString()}
                </div>
              </div>
            )}
          </div>

          {/* Addresses */}
          <div className="space-y-2">
            <div>
              <div className="text-gray-400 text-xs mb-1">Token Contract</div>
              <div className="flex items-center gap-2">
                <div className="font-mono text-xs bg-[#0a0e1a] p-2 rounded flex-1 break-all">
                  {tokenAddress}
                </div>
                <button
                  onClick={() => handleCopyAddress(tokenAddress, "Token")}
                  className="px-3 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded text-xs transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>

            <div>
              <div className="text-gray-400 text-xs mb-1">Pair Contract</div>
              <div className="flex items-center gap-2">
                <div className="font-mono text-xs bg-[#0a0e1a] p-2 rounded flex-1 break-all">
                  {tokenData.pair.pairAddress}
                </div>
                <button
                  onClick={() => handleCopyAddress(tokenData.pair.pairAddress, "Pair")}
                  className="px-3 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded text-xs transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <a
              href={`${OPN_CHAIN_CONFIG.explorerUrl}/address/${tokenAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-blue-500 hover:bg-blue-600 py-2.5 rounded text-sm font-medium text-center transition-colors"
            >
              View on Explorer
            </a>
            <a
              href={`${OPN_CHAIN_CONFIG.explorerUrl}/address/${tokenData.pair.pairAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-[#0a0e1a] hover:bg-[#1e2639] py-2.5 rounded text-sm font-medium text-center transition-colors"
            >
              View Pair
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
