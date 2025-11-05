"use client";

import { useState, useEffect } from "react";
import { fetchTokenData } from "@/lib/tokenService";
import { TokenInfo as TokenInfoType } from "@/lib/types";

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

  return (
    <div className="bg-[#131925] border border-[#1e2639] rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">Token Information</h3>

      {!tokenAddress ? (
        <div className="text-center text-gray-400 py-8">
          Search for a token to view details
        </div>
      ) : loading ? (
        <div className="text-center text-gray-400 py-8">
          Loading token data...
        </div>
      ) : error || !tokenData ? (
        <div className="text-center text-red-500 py-8">
          {error || "No data available for this token"}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xl font-bold">{tokenData.token.name}</h4>
              <span className="text-gray-400">{tokenData.token.symbol}</span>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">
                ${tokenData.price.price.toFixed(6)}
              </div>
              {tokenData.price.priceChange24h !== 0 && (
                <div
                  className={`text-sm ${
                    tokenData.price.priceChange24h >= 0
                      ? "text-green-500"
                      : "text-red-500"
                  }`}
                >
                  {tokenData.price.priceChange24h >= 0 ? "+" : ""}
                  {tokenData.price.priceChange24h.toFixed(2)}%
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[#1e2639] pt-3 grid grid-cols-2 gap-3">
            {tokenData.price.marketCap > 0 && (
              <div>
                <div className="text-gray-400 text-sm">Market Cap</div>
                <div className="font-semibold">
                  ${tokenData.price.marketCap.toLocaleString()}
                </div>
              </div>
            )}
            {tokenData.price.volume24h > 0 && (
              <div>
                <div className="text-gray-400 text-sm">24h Volume</div>
                <div className="font-semibold">
                  ${tokenData.price.volume24h.toLocaleString()}
                </div>
              </div>
            )}
            <div>
              <div className="text-gray-400 text-sm">Liquidity</div>
              <div className="font-semibold">
                ${tokenData.price.liquidity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            {tokenData.price.holders > 0 && (
              <div>
                <div className="text-gray-400 text-sm">Holders</div>
                <div className="font-semibold">
                  {tokenData.price.holders.toLocaleString()}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-[#1e2639] pt-3">
            <div className="text-gray-400 text-sm mb-1">Contract Address</div>
            <div className="font-mono text-sm bg-[#0a0e1a] p-2 rounded break-all">
              {tokenAddress}
            </div>
          </div>

          <div className="border-t border-[#1e2639] pt-3">
            <div className="text-gray-400 text-sm mb-1">Pair Address</div>
            <div className="font-mono text-sm bg-[#0a0e1a] p-2 rounded break-all">
              {tokenData.pair.pairAddress}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button className="flex-1 bg-blue-500 hover:bg-blue-600 py-2 rounded text-sm font-medium">
              Trade
            </button>
            <button className="flex-1 bg-[#0a0e1a] hover:bg-[#1e2639] py-2 rounded text-sm font-medium">
              Add to Watchlist
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
