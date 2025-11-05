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
    <div className="bg-[#131925] px-6 py-3">
      {!tokenAddress ? (
        <div className="text-center text-gray-400 py-4 text-sm">
          Search for a token to view details
        </div>
      ) : loading ? (
        <div className="text-center text-gray-400 py-4 flex items-center justify-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          <span className="text-sm">Loading...</span>
        </div>
      ) : error || !tokenData ? (
        <div className="text-center text-red-500 py-4 text-sm">
          {error || "No data available"}
        </div>
      ) : (
        <div className="flex items-center justify-between gap-6">
          {/* Token Name and Price */}
          <div className="flex items-center gap-6">
            <div>
              <h4 className="text-xl font-bold">{tokenData.token.name}</h4>
              <span className="text-sm text-gray-400">{tokenData.token.symbol}</span>
            </div>
            <div className="flex items-baseline gap-3">
              <div className="text-2xl font-bold">
                ${tokenData.price.price.toFixed(8)}
              </div>
              {tokenData.price.priceChange24h !== 0 && (
                <div
                  className={`text-lg font-semibold ${
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
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6">
            <div>
              <div className="text-xs text-gray-400">Liquidity</div>
              <div className="font-semibold">
                ${tokenData.price.liquidity.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
            {tokenData.price.volume24h > 0 && (
              <div>
                <div className="text-xs text-gray-400">24h Volume</div>
                <div className="font-semibold">
                  ${tokenData.price.volume24h.toLocaleString()}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <a
              href={`${OPN_CHAIN_CONFIG.explorerUrl}/address/${tokenAddress}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 rounded text-sm font-medium transition-colors"
            >
              View Token
            </a>
            <button
              onClick={() => handleCopyAddress(tokenAddress, "Token")}
              className="px-4 py-2 bg-[#0a0e1a] hover:bg-[#1e2639] rounded text-sm font-medium transition-colors"
            >
              Copy Address
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
