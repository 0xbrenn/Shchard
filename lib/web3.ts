import { ethers } from "ethers";
import { OPN_CHAIN_CONFIG, DEX_CONTRACTS } from "./config";

// ERC20 ABI (minimal)
export const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
];

// UniswapV2 Pair ABI (minimal)
export const PAIR_ABI = [
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function totalSupply() view returns (uint256)",
  "event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)",
  "event Sync(uint112 reserve0, uint112 reserve1)",
];

// UniswapV2 Factory ABI (minimal)
export const FACTORY_ABI = [
  "function getPair(address tokenA, address tokenB) view returns (address pair)",
  "function allPairs(uint256) view returns (address pair)",
  "function allPairsLength() view returns (uint256)",
];

let provider: ethers.JsonRpcProvider | null = null;

export function getProvider(): ethers.JsonRpcProvider {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(OPN_CHAIN_CONFIG.rpcUrl);
  }
  return provider;
}

export async function findTokenPair(tokenAddress: string): Promise<string | null> {
  const provider = getProvider();
  const factory = new ethers.Contract(DEX_CONTRACTS.factory, FACTORY_ABI, provider);

  try {
    // Try to find pair with WOPN
    const pairAddress = await factory.getPair(tokenAddress, DEX_CONTRACTS.WOPN);
    if (pairAddress && pairAddress !== ethers.ZeroAddress) {
      return pairAddress;
    }
    return null;
  } catch (error) {
    console.error("Error finding token pair:", error);
    return null;
  }
}

export async function getTokenInfo(tokenAddress: string) {
  const provider = getProvider();
  const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

  try {
    const [name, symbol, decimals] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.decimals(),
    ]);

    return {
      address: tokenAddress,
      name,
      symbol,
      decimals: Number(decimals),
    };
  } catch (error) {
    console.error("Error fetching token info:", error);
    throw error;
  }
}

export async function getPairReserves(pairAddress: string) {
  const provider = getProvider();
  const contract = new ethers.Contract(pairAddress, PAIR_ABI, provider);

  try {
    const [reserve0, reserve1, blockTimestampLast] = await contract.getReserves();
    const token0Address = await contract.token0();
    const token1Address = await contract.token1();

    return {
      reserve0: reserve0.toString(),
      reserve1: reserve1.toString(),
      blockTimestampLast: Number(blockTimestampLast),
      token0: token0Address,
      token1: token1Address,
    };
  } catch (error) {
    console.error("Error fetching pair reserves:", error);
    throw error;
  }
}

export async function getSwapEvents(
  pairAddress: string,
  fromBlock: number,
  toBlock: number | string = "latest"
) {
  const provider = getProvider();
  const contract = new ethers.Contract(pairAddress, PAIR_ABI, provider);

  try {
    const filter = contract.filters.Swap();
    const events = await contract.queryFilter(filter, fromBlock, toBlock);
    return events;
  } catch (error) {
    console.error("Error fetching swap events:", error);
    return [];
  }
}
