import dotenv from 'dotenv';
import Redis from 'redis';
import * as db from './database.js';
import { LogIndexer } from './indexer.js';

dotenv.config();

console.log('\n🔧 Shchard Indexer Worker Starting...\n');

// Configuration
const OPN_RPC = process.env.OPN_RPC || 'https://testnet-rpc.iopn.tech';
const OPN_WS = process.env.OPN_WS || 'wss://testnet-rpc.iopn.tech/ws';
const OPN_PRICE = 0.05;
const FACTORY_ADDRESS = '0x8860242B65611dfd077aEe26C3C7920813dF9208';
const WOPN_ADDRESS = '0xBc022C9dEb5AF250A526321d16Ef52E39b4DBD84';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Initialize database
db.initializeDatabase();
console.log('✅ Database initialized');

// Initialize Redis for pub/sub
let redisPublisher = null;

async function connectRedis() {
  try {
    redisPublisher = Redis.createClient({ url: REDIS_URL });

    redisPublisher.on('error', (err) => {
      console.error('❌ Redis error:', err.message);
    });

    redisPublisher.on('connect', () => {
      console.log('✅ Redis connected for publishing');
    });

    await redisPublisher.connect();
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    console.log('⚠️  Will continue without real-time broadcasting');
  }
}

// Initialize the indexer
const indexer = new LogIndexer({
  rpcUrl: OPN_RPC,
  wsUrl: OPN_WS,
  factoryAddress: FACTORY_ADDRESS,
  wopnAddress: WOPN_ADDRESS,
  opnPrice: OPN_PRICE,
  deploymentBlockOffset: 100000,
  onNewSwap: async (swap) => {
    // Publish swap to Redis for API workers to broadcast
    if (redisPublisher && redisPublisher.isOpen) {
      try {
        await redisPublisher.publish('swaps:new', JSON.stringify({
          type: 'swap',
          tokenAddress: swap.tokenAddress,
          data: {
            timestamp: swap.timestamp,
            price: swap.price,
            volume: swap.volume,
            blockNumber: swap.blockNumber,
            txHash: swap.txHash,
            type: swap.type,
            tokenAmount: swap.tokenAmount,
            wopnAmount: swap.wopnAmount
          }
        }));
      } catch (error) {
        console.error('❌ Failed to publish swap:', error.message);
      }
    }
  }
});

// Start the indexer
(async () => {
  try {
    // Connect to Redis first
    await connectRedis();

    // Start indexing
    console.log('\n🚀 Starting blockchain indexer...\n');
    await indexer.initialize();

    // Heartbeat
    setInterval(() => {
      const status = indexer.isRealtime ? '🟢 REAL-TIME' : '🟠 HISTORICAL';
      const lastBlock = db.getLastIndexedBlockGlobal();
      const tokens = db.getAllTokens();

      console.log(`\n💓 Indexer Heartbeat - Status: ${status}, Block: ${lastBlock}, Tokens: ${tokens.length}`);
      console.log(`   Redis: ${redisPublisher?.isOpen ? '🟢 Connected' : '🔴 Disconnected'}`);
    }, 60000); // Every minute

  } catch (error) {
    console.error('❌ Indexer worker failed to start:', error);
    process.exit(1);
  }
})();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n⚠️  SIGTERM received, shutting down gracefully...');

  if (indexer) {
    await indexer.stop();
  }

  if (redisPublisher) {
    await redisPublisher.quit();
  }

  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n⚠️  SIGINT received, shutting down gracefully...');

  if (indexer) {
    await indexer.stop();
  }

  if (redisPublisher) {
    await redisPublisher.quit();
  }

  process.exit(0);
});
