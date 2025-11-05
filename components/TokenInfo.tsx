"use client";

interface TokenInfoProps {
  tokenAddress: string | null;
}

export default function TokenInfo({ tokenAddress }: TokenInfoProps) {
  const tokenData = {
    name: "Sample Token",
    symbol: "SMPL",
    price: "$1.234",
    priceChange24h: "+12.45%",
    marketCap: "$1,234,567",
    volume24h: "$456,789",
    liquidity: "$234,567",
    holders: "1,234",
  };

  return (
    <div className="bg-[#131925] border border-[#1e2639] rounded-lg p-4">
      <h3 className="text-lg font-semibold mb-4">Token Information</h3>

      {tokenAddress ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xl font-bold">{tokenData.name}</h4>
              <span className="text-gray-400">{tokenData.symbol}</span>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{tokenData.price}</div>
              <div className="text-green-500 text-sm">
                {tokenData.priceChange24h}
              </div>
            </div>
          </div>

          <div className="border-t border-[#1e2639] pt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-gray-400 text-sm">Market Cap</div>
              <div className="font-semibold">{tokenData.marketCap}</div>
            </div>
            <div>
              <div className="text-gray-400 text-sm">24h Volume</div>
              <div className="font-semibold">{tokenData.volume24h}</div>
            </div>
            <div>
              <div className="text-gray-400 text-sm">Liquidity</div>
              <div className="font-semibold">{tokenData.liquidity}</div>
            </div>
            <div>
              <div className="text-gray-400 text-sm">Holders</div>
              <div className="font-semibold">{tokenData.holders}</div>
            </div>
          </div>

          <div className="border-t border-[#1e2639] pt-3">
            <div className="text-gray-400 text-sm mb-1">Contract Address</div>
            <div className="font-mono text-sm bg-[#0a0e1a] p-2 rounded break-all">
              {tokenAddress}
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
      ) : (
        <div className="text-center text-gray-400 py-8">
          Search for a token to view details
        </div>
      )}
    </div>
  );
}
