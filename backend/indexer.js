import { ethers } from 'ethers';
import * as db from './database.js';

/**
 * Log-Based Blockchain Indexer (DEXScreener Architecture)
 *
 * This indexer reads raw blockchain logs using getLogs() instead of
 * monitoring individual pairs. Much more efficient and scalable.
 */

// Event signatures (keccak256 hashes)
const EVENT_SIGNATURES = {
  Swap: '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822',
  PairCreated: '0x0d3648bd0f6ba80134a33ba9275ac585d9d315f0ad8355cddefde31aaaf28c7',
  Mint: '0x4c209b5fc8ad50758f13e2e1088ba56a560dff690a1c6fef26394f4c03821c4f',
  Burn: '0xdccd412f0b1252819cb1fd330b93224ca42612892bb3f4f789976e6d81936496',
  Sync: '0x1c411e9a96e071241c2f21f7726b17ae89e3cab4c78be50e062b03a9fffbbad1'
};

// ABIs for decoding
const PAIR_ABI = [
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
  'event Mint(address indexed sender, uint256 amount0, uint256 amount1)',
  'event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)',
  'event Sync(uint112 reserve0, uint112 reserve1)',
  'function token0() view returns (address)',
  'function token1() view returns (address)'
];

const FACTORY_ABI = [
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)'
];

const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
];

export class LogIndexer {
  constructor(config) {
    this.rpcUrl = config.rpcUrl;
    this.wsUrl = config.wsUrl;
    this.factoryAddress = config.factoryAddress.toLowerCase();
    this.wopnAddress = config.wopnAddress.toLowerCase();
    this.opnPrice = config.opnPrice || 0.05;
    this.deploymentBlockOffset = config.deploymentBlockOffset || 100000; // Start 100k blocks ago by default

    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    this.wsProvider = null;

    // Decoders
    this.pairInterface = new ethers.Interface(PAIR_ABI);
    this.factoryInterface = new ethers.Interface(FACTORY_ABI);
    this.erc20Interface = new ethers.Interface(ERC20_ABI);

    // Caches
    this.pairCache = new Map(); // pairAddress -> {token0, token1, decimals, etc}
    this.blockTimestampCache = new Map(); // blockNumber -> timestamp

    // State
    this.isIndexing = false;
    this.isRealtime = false;
  }

  /**
   * Initialize the indexer
   */
  async initialize() {
    console.log('\n🚀 Initializing Log-Based Indexer...');

    try {
      // Test RPC connection
      const blockNumber = await this.provider.getBlockNumber();
      console.log(`   Connected to RPC: Block ${blockNumber}`);

      // Check last indexed block
      const lastIndexed = db.getLastIndexedBlockGlobal();
      console.log(`   Last indexed block: ${lastIndexed || 'None'}`);

      // Determine start block
      let startBlock;
      if (lastIndexed) {
        // Resume from last indexed
        startBlock = lastIndexed + 1;
      } else {
        // First time: start from deployment block (current - offset)
        startBlock = Math.max(0, blockNumber - this.deploymentBlockOffset);
        console.log(`   Starting from deployment block (${this.deploymentBlockOffset} blocks ago): ${startBlock}`);
      }

      // Start historical indexing if needed
      if (blockNumber - startBlock > 10) {
        await this.startHistoricalIndexing(startBlock, blockNumber);
      } else {
        console.log('   Already caught up with chain');
      }

      // Start real-time indexing
      await this.startRealtimeIndexing();

      return true;
    } catch (error) {
      console.error('❌ Indexer initialization failed:', error.message);
      return false;
    }
  }

  /**
   * Historical indexing - catch up from startBlock to currentBlock
   */
  async startHistoricalIndexing(startBlock, endBlock) {
    if (this.isIndexing) {
      console.log('⚠️  Historical indexing already in progress');
      return;
    }

    this.isIndexing = true;
    console.log(`\n📚 Starting historical indexing: blocks ${startBlock} → ${endBlock}`);

    const BATCH_SIZE = 2000; // Process 2000 blocks at a time
    let fromBlock = startBlock;

    try {
      while (fromBlock < endBlock) {
        const toBlock = Math.min(fromBlock + BATCH_SIZE, endBlock);

        console.log(`   Processing blocks ${fromBlock} → ${toBlock}...`);

        // Get all DEX-related logs in this range
        const logs = await this.getLogs(fromBlock, toBlock);
        console.log(`   Found ${logs.length} events`);

        // Process all logs
        await this.processLogs(logs);

        // Update progress
        db.setLastIndexedBlockGlobal(toBlock);

        fromBlock = toBlock + 1;

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`✅ Historical indexing complete: ${endBlock - startBlock} blocks processed`);
    } catch (error) {
      console.error('❌ Historical indexing error:', error.message);
      console.log(`   Progress saved at block ${fromBlock - 1}`);
    } finally {
      this.isIndexing = false;
    }
  }

  /**
   * Real-time indexing - process new blocks as they arrive
   */
  async startRealtimeIndexing() {
    if (this.isRealtime) {
      console.log('⚠️  Real-time indexing already active');
      return;
    }

    try {
      // Connect to WebSocket
      this.wsProvider = new ethers.WebSocketProvider(this.wsUrl);

      this.wsProvider.on('block', async (blockNumber) => {
        console.log(`\n📦 New block: ${blockNumber}`);

        try {
          // Get logs from this block
          const logs = await this.getLogs(blockNumber, blockNumber);

          if (logs.length > 0) {
            console.log(`   Found ${logs.length} events in block`);
            await this.processLogs(logs);
          }

          // Update last indexed block
          db.setLastIndexedBlockGlobal(blockNumber);
        } catch (error) {
          console.error(`   Error processing block ${blockNumber}:`, error.message);
        }
      });

      this.isRealtime = true;
      console.log('✅ Real-time indexing started');

      // Handle disconnections
      if (this.wsProvider.websocket) {
        this.wsProvider.websocket.on('close', () => {
          console.log('⚠️  WebSocket closed, reconnecting...');
          this.isRealtime = false;
          setTimeout(() => this.startRealtimeIndexing(), 5000);
        });
      }
    } catch (error) {
      console.error('❌ Real-time indexing failed:', error.message);
      this.isRealtime = false;

      // Retry after 10 seconds
      setTimeout(() => this.startRealtimeIndexing(), 10000);
    }
  }

  /**
   * Get all DEX-related logs from a block range
   */
  async getLogs(fromBlock, toBlock) {
    const logs = [];

    try {
      // Get PairCreated events from factory
      const pairCreatedLogs = await this.provider.getLogs({
        fromBlock,
        toBlock,
        address: this.factoryAddress,
        topics: [EVENT_SIGNATURES.PairCreated]
      });
      logs.push(...pairCreatedLogs);

      // Get Swap events from all pairs
      const swapLogs = await this.provider.getLogs({
        fromBlock,
        toBlock,
        topics: [EVENT_SIGNATURES.Swap]
      });
      logs.push(...swapLogs);

      // Get Sync events (for reserve updates)
      const syncLogs = await this.provider.getLogs({
        fromBlock,
        toBlock,
        topics: [EVENT_SIGNATURES.Sync]
      });
      logs.push(...syncLogs);

    } catch (error) {
      console.error(`Error fetching logs for blocks ${fromBlock}-${toBlock}:`, error.message);
    }

    // Sort by block number and log index for correct ordering
    logs.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) {
        return a.blockNumber - b.blockNumber;
      }
      return a.logIndex - b.logIndex;
    });

    return logs;
  }

  /**
   * Process logs and save to database
   */
  async processLogs(logs) {
    const pairCreatedLogs = [];
    const swapLogs = [];
    const syncLogs = [];

    // Categorize logs by type
    for (const log of logs) {
      const topic = log.topics[0];

      if (topic === EVENT_SIGNATURES.PairCreated) {
        pairCreatedLogs.push(log);
      } else if (topic === EVENT_SIGNATURES.Swap) {
        swapLogs.push(log);
      } else if (topic === EVENT_SIGNATURES.Sync) {
        syncLogs.push(log);
      }
    }

    // Process in order: pairs first, then swaps, then syncs
    if (pairCreatedLogs.length > 0) {
      await this.processPairCreated(pairCreatedLogs);
    }

    if (swapLogs.length > 0) {
      await this.processSwaps(swapLogs);
    }

    if (syncLogs.length > 0) {
      await this.processSyncs(syncLogs);
    }
  }

  /**
   * Process PairCreated events
   */
  async processPairCreated(logs) {
    console.log(`   Processing ${logs.length} PairCreated events...`);

    for (const log of logs) {
      try {
        const decoded = this.factoryInterface.parseLog({
          topics: log.topics,
          data: log.data
        });

        const token0 = decoded.args.token0.toLowerCase();
        const token1 = decoded.args.token1.toLowerCase();
        const pairAddress = decoded.args.pair.toLowerCase();

        // Only process pairs with WOPN
        if (token0 !== this.wopnAddress && token1 !== this.wopnAddress) {
          continue;
        }

        // Get token metadata
        const tokenAddress = token0 === this.wopnAddress ? token1 : token0;
        const isToken0 = token0 !== this.wopnAddress;

        const metadata = await this.getTokenMetadata(tokenAddress);

        // Cache pair info
        this.pairCache.set(pairAddress, {
          token0,
          token1,
          tokenAddress,
          isToken0,
          decimals: metadata.decimals,
          symbol: metadata.symbol,
          name: metadata.name
        });

        // Save to database
        db.upsertToken({
          address: tokenAddress,
          name: metadata.name,
          symbol: metadata.symbol,
          decimals: metadata.decimals,
          pairAddress
        });

        console.log(`      ✓ Pair created: ${metadata.symbol}/${isToken0 ? 'WOPN' : 'WOPN'} at ${pairAddress.substring(0, 10)}...`);
      } catch (error) {
        console.error(`      ✗ Error processing PairCreated:`, error.message);
      }
    }
  }

  /**
   * Process Swap events
   */
  async processSwaps(logs) {
    console.log(`   Processing ${logs.length} Swap events...`);

    const swaps = [];

    for (const log of logs) {
      try {
        const decoded = this.pairInterface.parseLog({
          topics: log.topics,
          data: log.data
        });

        const pairAddress = log.address.toLowerCase();

        // Get pair info
        let pairInfo = this.pairCache.get(pairAddress);

        if (!pairInfo) {
          // Unknown pair, fetch metadata
          pairInfo = await this.getPairInfo(pairAddress);

          if (!pairInfo) {
            // Not a WOPN pair, skip
            continue;
          }

          this.pairCache.set(pairAddress, pairInfo);
        }

        // Get block timestamp
        const timestamp = await this.getBlockTimestamp(log.blockNumber);

        // Decode amounts
        const amount0In = decoded.args.amount0In;
        const amount1In = decoded.args.amount1In;
        const amount0Out = decoded.args.amount0Out;
        const amount1Out = decoded.args.amount1Out;

        // Calculate swap metrics
        const swap = this.calculateSwapMetrics({
          pairAddress,
          blockNumber: log.blockNumber,
          logIndex: log.logIndex,
          transactionHash: log.transactionHash,
          timestamp,
          sender: decoded.args.sender.toLowerCase(),
          to: decoded.args.to.toLowerCase(),
          amount0In,
          amount1In,
          amount0Out,
          amount1Out
        }, pairInfo);

        swaps.push(swap);
      } catch (error) {
        console.error(`      ✗ Error processing Swap at ${log.transactionHash}:`, error.message);
      }
    }

    // Batch insert to database
    if (swaps.length > 0) {
      db.insertSwapsBatch(swaps);
      console.log(`      ✓ Saved ${swaps.length} swaps`);
    }
  }

  /**
   * Process Sync events (reserve updates)
   */
  async processSyncs(logs) {
    // Sync events update pair reserves
    // We can use these to track liquidity over time
    // For now, we'll just log them
    // console.log(`   Processing ${logs.length} Sync events...`);
  }

  /**
   * Calculate swap metrics from decoded log
   */
  calculateSwapMetrics(swap, pairInfo) {
    const { decimals, isToken0, tokenAddress } = pairInfo;

    // Convert amounts from wei
    const amount0In = Number(swap.amount0In) / 1e18; // WOPN is 18 decimals
    const amount1In = Number(swap.amount1In) / (10 ** decimals);
    const amount0Out = Number(swap.amount0Out) / 1e18;
    const amount1Out = Number(swap.amount1Out) / (10 ** decimals);

    let price, volume, tokenAmount, wopnAmount, isBuy;

    if (isToken0) {
      // Token is token0, WOPN is token1
      if (amount0Out > 0) {
        // Buying token (token0) with WOPN (token1)
        isBuy = true;
        price = amount1In / amount0Out; // WOPN per token
        tokenAmount = amount0Out;
        wopnAmount = amount1In;
      } else {
        // Selling token (token0) for WOPN (token1)
        isBuy = false;
        price = amount1Out / amount0In;
        tokenAmount = amount0In;
        wopnAmount = amount1Out;
      }
    } else {
      // Token is token1, WOPN is token0
      if (amount1Out > 0) {
        // Buying token (token1) with WOPN (token0)
        isBuy = true;
        price = amount0In / amount1Out; // WOPN per token
        tokenAmount = amount1Out;
        wopnAmount = amount0In;
      } else {
        // Selling token (token1) for WOPN (token0)
        isBuy = false;
        price = amount0Out / amount1In;
        tokenAmount = amount1In;
        wopnAmount = amount0Out;
      }
    }

    const priceUSD = price * this.opnPrice;
    const volumeUSD = wopnAmount * this.opnPrice;

    return {
      tokenAddress,
      blockNumber: swap.blockNumber,
      timestamp: swap.timestamp,
      price: priceUSD,
      volume: volumeUSD,
      type: isBuy ? 'buy' : 'sell',
      txHash: swap.transactionHash,
      tokenAmount,
      wopnAmount
    };
  }

  /**
   * Get token metadata (with caching)
   */
  async getTokenMetadata(tokenAddress) {
    try {
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);

      const [name, symbol, decimalsRaw] = await Promise.all([
        contract.name().catch(() => 'Unknown'),
        contract.symbol().catch(() => 'UNKNOWN'),
        contract.decimals().catch(() => 18)
      ]);

      const decimals = typeof decimalsRaw === 'bigint' ? Number(decimalsRaw) : decimalsRaw;

      return { name, symbol, decimals };
    } catch (error) {
      console.error(`Error fetching metadata for ${tokenAddress}:`, error.message);
      return { name: 'Unknown', symbol: 'UNKNOWN', decimals: 18 };
    }
  }

  /**
   * Get pair info for unknown pairs
   */
  async getPairInfo(pairAddress) {
    try {
      const contract = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);

      const [token0, token1] = await Promise.all([
        contract.token0(),
        contract.token1()
      ]);

      const token0Lower = token0.toLowerCase();
      const token1Lower = token1.toLowerCase();

      // Check if this is a WOPN pair
      if (token0Lower !== this.wopnAddress && token1Lower !== this.wopnAddress) {
        return null; // Not a WOPN pair
      }

      const tokenAddress = token0Lower === this.wopnAddress ? token1Lower : token0Lower;
      const isToken0 = token0Lower !== this.wopnAddress;

      const metadata = await this.getTokenMetadata(tokenAddress);

      return {
        token0: token0Lower,
        token1: token1Lower,
        tokenAddress,
        isToken0,
        decimals: metadata.decimals,
        symbol: metadata.symbol,
        name: metadata.name
      };
    } catch (error) {
      console.error(`Error getting pair info for ${pairAddress}:`, error.message);
      return null;
    }
  }

  /**
   * Get block timestamp (with caching)
   */
  async getBlockTimestamp(blockNumber) {
    if (this.blockTimestampCache.has(blockNumber)) {
      return this.blockTimestampCache.get(blockNumber);
    }

    try {
      const block = await this.provider.getBlock(blockNumber);
      const timestamp = block.timestamp;

      this.blockTimestampCache.set(blockNumber, timestamp);

      // Clear old cache entries (keep last 1000 blocks)
      if (this.blockTimestampCache.size > 1000) {
        const oldestKey = Math.min(...this.blockTimestampCache.keys());
        this.blockTimestampCache.delete(oldestKey);
      }

      return timestamp;
    } catch (error) {
      console.error(`Error getting block ${blockNumber}:`, error.message);
      return Math.floor(Date.now() / 1000); // Fallback to current time
    }
  }

  /**
   * Stop the indexer
   */
  async stop() {
    console.log('Stopping indexer...');

    if (this.wsProvider) {
      this.wsProvider.destroy();
      this.wsProvider = null;
    }

    this.isRealtime = false;
    this.isIndexing = false;
  }
}
