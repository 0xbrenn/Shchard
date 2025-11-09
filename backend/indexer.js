import { ethers } from 'ethers';
import * as db from './database.js';

/**
 * Log-Based Blockchain Indexer (DEXScreener Architecture)
 *
 * This indexer reads raw blockchain logs using getLogs() instead of
 * monitoring individual pairs. Much more efficient and scalable.
 */

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

// Calculate event signatures using ethers.js (ensures correct length)
const pairInterface = new ethers.Interface(PAIR_ABI);
const factoryInterface = new ethers.Interface(FACTORY_ABI);

const EVENT_SIGNATURES = {
  Swap: pairInterface.getEvent('Swap').topicHash,
  PairCreated: factoryInterface.getEvent('PairCreated').topicHash,
  Mint: pairInterface.getEvent('Mint').topicHash,
  Burn: pairInterface.getEvent('Burn').topicHash,
  Sync: pairInterface.getEvent('Sync').topicHash
};

console.log('✓ Event signatures calculated:', EVENT_SIGNATURES);

export class LogIndexer {
  constructor(config) {
    this.rpcUrl = config.rpcUrl;
    this.wsUrl = config.wsUrl;
    this.factoryAddress = config.factoryAddress.toLowerCase();
    this.wopnAddress = config.wopnAddress.toLowerCase();
    this.opnPrice = config.opnPrice || 0.05;
    this.deploymentBlockOffset = config.deploymentBlockOffset || 100000; // Start 100k blocks ago by default
    this.onNewSwap = config.onNewSwap || null; // Callback for real-time swaps

    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    this.wsProvider = null;

    // Use shared interfaces (already created above for signatures)
    this.pairInterface = pairInterface;
    this.factoryInterface = factoryInterface;
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
      console.log(`🔌 Connecting to WebSocket RPC at ${this.wsUrl}`);
      this.wsProvider = new ethers.WebSocketProvider(this.wsUrl);

      let lastBlockTime = Date.now();
      let reconnectAttempts = 0;

      this.wsProvider.on('block', async (blockNumber) => {
        console.log(`\n📦 New block: ${blockNumber}`);
        lastBlockTime = Date.now();
        reconnectAttempts = 0; // Reset on successful block

        try {
          // Get logs from this block
          const logs = await this.getLogs(blockNumber, blockNumber);

          if (logs.length > 0) {
            console.log(`   Found ${logs.length} events in block`);
            await this.processLogs(logs, true); // isRealtime = true for live broadcast
          }

          // Update last indexed block
          db.setLastIndexedBlockGlobal(blockNumber);
        } catch (error) {
          console.error(`   Error processing block ${blockNumber}:`, error.message);
        }
      });

      // Handle provider errors
      this.wsProvider.on('error', (error) => {
        console.error('❌ WebSocket provider error:', error.code || error.message);
      });

      // Monitor connection health with keepalive
      const keepaliveInterval = setInterval(async () => {
        if (!this.isRealtime || !this.wsProvider) {
          clearInterval(keepaliveInterval);
          return;
        }

        const timeSinceLastBlock = Date.now() - lastBlockTime;

        // If no block for 2 minutes, check connection health
        if (timeSinceLastBlock > 120000) {
          console.log(`⚠️  No blocks for ${Math.floor(timeSinceLastBlock / 1000)}s, checking connection...`);

          try {
            // Try to fetch current block number to test connection
            const currentBlock = await this.wsProvider.getBlockNumber();
            console.log(`   ✅ Connection healthy, current block: ${currentBlock}`);
            lastBlockTime = Date.now();
          } catch (error) {
            console.error(`   ❌ Connection test failed: ${error.message}`);
            console.log(`   🔄 Forcing reconnection...`);
            clearInterval(keepaliveInterval);
            this.isRealtime = false;

            if (this.wsProvider) {
              try {
                this.wsProvider.destroy();
              } catch (e) {
                // Ignore destroy errors
              }
              this.wsProvider = null;
            }

            setTimeout(() => this.startRealtimeIndexing(), 5000);
          }
        }
      }, 30000); // Check every 30 seconds

      this.isRealtime = true;
      console.log('✅ Real-time indexing started');
      console.log('   Keepalive: Checking connection health every 30s');

      // Handle disconnections
      if (this.wsProvider.websocket) {
        this.wsProvider.websocket.on('close', (code, reason) => {
          console.log(`⚠️  WebSocket closed (code: ${code}, reason: ${reason || 'none'})`);
          reconnectAttempts++;

          clearInterval(keepaliveInterval);
          this.isRealtime = false;

          const delay = Math.min(5000 * reconnectAttempts, 30000); // Max 30s delay
          console.log(`   🔄 Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})...`);
          setTimeout(() => this.startRealtimeIndexing(), delay);
        });

        this.wsProvider.websocket.on('error', (error) => {
          console.error('❌ WebSocket connection error:', error.code || error.message);
        });

        // Handle pong responses (some providers support this)
        this.wsProvider.websocket.on('pong', () => {
          // Connection is alive
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
  async processLogs(logs, isRealtime = false) {
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
      await this.processSwaps(swapLogs, isRealtime);
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
  async processSwaps(logs, isRealtime = false) {
    console.log(`   Processing ${logs.length} Swap events...`);
    const startTime = Date.now();

    // OPTIMIZATION: Batch fetch all unique block timestamps upfront
    const uniqueBlocks = [...new Set(logs.map(log => log.blockNumber))];
    const uncachedBlocks = uniqueBlocks.filter(block => !this.blockTimestampCache.has(block));

    if (uncachedBlocks.length > 0) {
      console.log(`      ⏱️  Pre-fetching timestamps for ${uncachedBlocks.length} unique blocks...`);
      const fetchStart = Date.now();

      // Fetch blocks in parallel (limited to 10 concurrent requests)
      const BATCH_SIZE = 10;
      for (let i = 0; i < uncachedBlocks.length; i += BATCH_SIZE) {
        const batch = uncachedBlocks.slice(i, i + BATCH_SIZE);
        const blockPromises = batch.map(blockNum =>
          this.provider.getBlock(blockNum)
            .then(block => {
              if (block) {
                this.blockTimestampCache.set(blockNum, block.timestamp);
              }
              return block;
            })
            .catch(err => {
              console.error(`      ✗ Failed to fetch block ${blockNum}:`, err.message);
              return null;
            })
        );

        await Promise.all(blockPromises);
      }

      const fetchTime = Date.now() - fetchStart;
      console.log(`      ✅ Fetched ${uncachedBlocks.length} block timestamps in ${fetchTime}ms (${(fetchTime / uncachedBlocks.length).toFixed(1)}ms/block)`);
    }

    // OPTIMIZATION: Pre-fetch pair info for unknown pairs
    const uniquePairs = [...new Set(logs.map(log => log.address.toLowerCase()))];
    const unknownPairs = uniquePairs.filter(addr => !this.pairCache.has(addr));

    if (unknownPairs.length > 0) {
      console.log(`      🔍 Pre-fetching info for ${unknownPairs.length} unknown pairs...`);
      const pairStart = Date.now();

      for (const pairAddress of unknownPairs) {
        const pairInfo = await this.getPairInfo(pairAddress);
        if (pairInfo) {
          this.pairCache.set(pairAddress, pairInfo);
        }
      }

      const pairTime = Date.now() - pairStart;
      console.log(`      ✅ Fetched ${unknownPairs.length} pair infos in ${pairTime}ms`);
    }

    const swaps = [];

    for (const log of logs) {
      try {
        const decoded = this.pairInterface.parseLog({
          topics: log.topics,
          data: log.data
        });

        const pairAddress = log.address.toLowerCase();

        // Get pair info (should be cached now)
        const pairInfo = this.pairCache.get(pairAddress);

        if (!pairInfo) {
          // Not a WOPN pair, skip
          continue;
        }

        // Get block timestamp (should be cached now)
        const timestamp = this.blockTimestampCache.get(log.blockNumber) || Math.floor(Date.now() / 1000);

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

        // Broadcast real-time swaps to frontend via callback
        if (isRealtime && this.onNewSwap) {
          this.onNewSwap(swap);
        }
      } catch (error) {
        console.error(`      ✗ Error processing Swap at ${log.transactionHash}:`, error.message);
      }
    }

    // Batch insert to database
    if (swaps.length > 0) {
      const dbStart = Date.now();
      db.insertSwapsBatch(swaps);
      const dbTime = Date.now() - dbStart;
      console.log(`      ✓ Saved ${swaps.length} swaps to database in ${dbTime}ms`);
    }

    const totalTime = Date.now() - startTime;
    const swapsPerSecond = swaps.length > 0 ? ((swaps.length / totalTime) * 1000).toFixed(0) : 0;
    console.log(`      ⚡ Total processing time: ${totalTime}ms (${swapsPerSecond} swaps/sec)`);
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
      pairAddress: swap.pairAddress,
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
