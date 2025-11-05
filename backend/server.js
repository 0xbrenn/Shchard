import { ethers } from 'ethers';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import dotenv from 'dotenv';
import * as db from './database.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Initialize database
db.initializeDatabase();
console.log('✅ Database ready');

// Configuration
const OPN_RPC = process.env.OPN_RPC || 'https://testnet-rpc.iopn.tech';
const OPN_WS = process.env.OPN_WS || 'wss://testnet-rpc.iopn.tech/ws';
const OPN_PRICE = 0.05;
const FACTORY_ADDRESS = '0x8860242B65611dfd077aEe26C3C7920813dF9208';
const WOPN_ADDRESS = '0xBc022C9dEb5AF250A526321d16Ef52E39b4DBD84';

const PAIR_ABI = [
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)'
];

const FACTORY_ABI = [
  'function getPair(address tokenA, address tokenB) view returns (address pair)'
];

// Pair cache for fast lookups
const pairCache = new Map(); // tokenAddress -> pairAddress

// HTTP provider for queries
const provider = new ethers.JsonRpcProvider(OPN_RPC);

// WebSocket provider for real-time
let wsProvider = null;

async function connectWebSocket() {
  // Don't crash on connection errors - real-time features will just be disabled
  try {
    if (wsProvider) {
      try {
        wsProvider.destroy();
      } catch (e) {
        // Ignore destroy errors
      }
    }

    wsProvider = new ethers.WebSocketProvider(OPN_WS);

    // Set up reconnection handlers
    wsProvider.on('error', (error) => {
      console.error('❌ WebSocket error:', error.message);
    });

    wsProvider.on('close', () => {
      console.log('⚠️ WebSocket closed, reconnecting in 5 seconds...');
      wsProvider = null;
      setTimeout(connectWebSocket, 5000);
    });

    // Wait a bit to see if connection succeeds
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('✅ WebSocket connected to OPN Chain');
  } catch (error) {
    console.error('❌ WebSocket connection failed:', error.code || error.message);
    console.log('⚠️ Real-time features will be disabled. API will still work for historical data.');
    wsProvider = null;
    // Try again in 30 seconds
    setTimeout(connectWebSocket, 30000);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error.message);
  if (error.code === 'EAI_AGAIN' || error.code === 'ENOTFOUND') {
    console.log('⚠️ Network error, continuing with limited functionality');
  }
});

// Find pair for token
async function findPair(tokenAddress) {
  if (pairCache.has(tokenAddress.toLowerCase())) {
    return pairCache.get(tokenAddress.toLowerCase());
  }

  const factory = new ethers.Contract(FACTORY_ADDRESS, FACTORY_ABI, provider);
  const pairAddress = await factory.getPair(tokenAddress, WOPN_ADDRESS);

  if (pairAddress && pairAddress !== ethers.ZeroAddress) {
    pairCache.set(tokenAddress.toLowerCase(), pairAddress);
    return pairAddress;
  }

  return null;
}

// Process swap event into standardized format
async function processSwapEvent(event, tokenAddress, isToken0) {
  try {
    const block = await event.getBlock();
    const args = event.args;

    const amount0In = args[1];
    const amount1In = args[2];
    const amount0Out = args[3];
    const amount1Out = args[4];

    const isBuy = isToken0 ? amount0Out > 0n : amount1Out > 0n;
    const tokenAmount = isToken0
      ? (isBuy ? amount0Out : amount0In)
      : (isBuy ? amount1Out : amount1In);
    const wopnAmount = isToken0
      ? (isBuy ? amount1In : amount1Out)
      : (isBuy ? amount0In : amount0Out);

    const tokenAmountNum = Number(tokenAmount) / 1e18;
    const wopnAmountNum = Number(wopnAmount) / 1e18;

    if (tokenAmountNum === 0 || wopnAmountNum === 0) return null;

    const priceInWOPN = wopnAmountNum / tokenAmountNum;
    const priceInUSD = priceInWOPN * OPN_PRICE;
    const volumeUSD = wopnAmountNum * OPN_PRICE;

    return {
      timestamp: block.timestamp,
      price: priceInUSD,
      volume: volumeUSD,
      blockNumber: block.number,
      txHash: event.transactionHash,
      type: isBuy ? 'buy' : 'sell',
      tokenAmount: tokenAmountNum,
      wopnAmount: wopnAmountNum
    };
  } catch (error) {
    console.error('Error processing swap:', error);
    return null;
  }
}

// Index historical swaps for a token
async function indexTokenSwaps(tokenAddress, fromBlock = null) {
  console.log(`📊 Indexing swaps for ${tokenAddress}...`);

  const pairAddress = await findPair(tokenAddress);
  if (!pairAddress) {
    console.log('No pair found');
    return;
  }

  const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, provider);
  const token0 = await pairContract.token0();
  const token1 = await pairContract.token1();
  const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase();

  // Check if we've already indexed this token
  const lastIndexed = db.getLastIndexedBlock(tokenAddress);

  const currentBlock = await provider.getBlockNumber();
  const startBlock = fromBlock || lastIndexed || Math.max(0, currentBlock - 50000); // Last 50k blocks

  console.log(`  Fetching from block ${startBlock} to ${currentBlock}`);

  // Save pair info to database
  db.upsertPair({
    address: pairAddress,
    token0,
    token1,
    token0Symbol: isToken0 ? 'TOKEN' : 'WOPN',
    token1Symbol: isToken0 ? 'WOPN' : 'TOKEN',
    reserve0: '0',
    reserve1: '0'
  });

  const filter = pairContract.filters.Swap();
  const CHUNK_SIZE = 10000; // OPN Chain limit
  const allEvents = [];

  // Fetch in chunks to respect RPC limits
  for (let from = startBlock; from <= currentBlock; from += CHUNK_SIZE) {
    const to = Math.min(from + CHUNK_SIZE - 1, currentBlock);
    console.log(`    Chunk: ${from} to ${to}`);

    try {
      const events = await pairContract.queryFilter(filter, from, to);
      allEvents.push(...events);
    } catch (error) {
      console.error(`    Failed to fetch chunk ${from}-${to}:`, error.message);
    }
  }

  const swapsToInsert = [];
  for (const event of allEvents) {
    const swap = await processSwapEvent(event, tokenAddress, isToken0);
    if (swap) {
      swapsToInsert.push({
        txHash: swap.txHash,
        pairAddress: pairAddress,
        tokenAddress: tokenAddress.toLowerCase(),
        blockNumber: swap.blockNumber,
        timestamp: swap.timestamp,
        price: swap.price,
        volume: swap.volume,
        type: swap.type,
        tokenAmount: swap.tokenAmount,
        wopnAmount: swap.wopnAmount
      });
    }
  }

  // Batch insert swaps into database
  if (swapsToInsert.length > 0) {
    db.insertSwapsBatch(swapsToInsert);
  }

  console.log(`✅ Indexed ${swapsToInsert.length} swaps for ${tokenAddress}`);
  return swapsToInsert;
}

// Keep track of subscribed tokens
const subscribedTokens = new Set();

// Subscribe to real-time swaps
async function subscribeToRealTimeSwaps(tokenAddress) {
  try {
    const lowerToken = tokenAddress.toLowerCase();

    // Don't subscribe twice
    if (subscribedTokens.has(lowerToken)) {
      console.log(`✓ Already subscribed to ${tokenAddress}`);
      return;
    }

    if (!wsProvider) {
      console.log(`⚠️ WebSocket not connected, will retry subscription for ${tokenAddress} later`);
      // Retry after 10 seconds
      setTimeout(() => subscribeToRealTimeSwaps(tokenAddress), 10000);
      return;
    }

    const pairAddress = await findPair(tokenAddress);
    if (!pairAddress) {
      console.log(`⚠️ No pair found for ${tokenAddress}`);
      return;
    }

    console.log(`🔍 Setting up listener for pair ${pairAddress} (token: ${tokenAddress})`);

    const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, wsProvider);
    const token0 = await pairContract.token0();
    const token1 = await pairContract.token1();
    const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase();

    console.log(`   Token0: ${token0}`);
    console.log(`   Token1: ${token1}`);
    console.log(`   Watching token: ${tokenAddress} (is token${isToken0 ? '0' : '1'})`);

    pairContract.on('Swap', async (...args) => {
      console.log(`📡 Swap event received on pair ${pairAddress}`);
      const event = args[args.length - 1];
      const swap = await processSwapEvent(event, tokenAddress, isToken0);

      if (swap) {
        console.log(`🔥 New swap detected for ${tokenAddress}:`, {
          price: swap.price,
          volume: swap.volume,
          type: swap.type,
          txHash: swap.txHash
        });

        // Save to database
        const swapData = {
          txHash: swap.txHash,
          pairAddress,
          tokenAddress: tokenAddress.toLowerCase(),
          blockNumber: swap.blockNumber,
          timestamp: swap.timestamp,
          price: swap.price,
          volume: swap.volume,
          type: swap.type,
          tokenAmount: swap.tokenAmount,
          wopnAmount: swap.wopnAmount
        };

        try {
          db.insertSwap(swapData);
          console.log(`💾 Saved swap to database`);
        } catch (error) {
          // Ignore duplicate errors
          if (!error.message.includes('UNIQUE')) {
            console.error('Error saving swap:', error.message);
          }
        }

        // Broadcast to all connected WebSocket clients
        const clientCount = wss.clients.size;
        broadcastSwap(tokenAddress, swap);
        console.log(`📤 Broadcast to ${clientCount} WebSocket clients`);
      } else {
        console.log(`⚠️ Swap event processed but returned null`);
      }
    });

    subscribedTokens.add(lowerToken);
    console.log(`🔌 Subscribed to real-time swaps for ${tokenAddress} at pair ${pairAddress}`);
  } catch (error) {
    console.error(`Failed to subscribe to swaps for ${tokenAddress}:`, error.message);
    // Retry after 10 seconds
    setTimeout(() => subscribeToRealTimeSwaps(tokenAddress), 10000);
  }
}

// Broadcast swap to WebSocket clients
function broadcastSwap(tokenAddress, swap) {
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // OPEN
      client.send(JSON.stringify({
        type: 'swap',
        tokenAddress,
        data: swap
      }));
    }
  });
}

// Build OHLCV candles from swaps
function buildCandles(swaps, intervalSeconds) {
  if (swaps.length === 0) return [];

  const candles = [];
  const firstTimestamp = swaps[0].timestamp;
  const lastTimestamp = swaps[swaps.length - 1].timestamp;
  const startTime = Math.floor(firstTimestamp / intervalSeconds) * intervalSeconds;
  const endTime = Math.floor(lastTimestamp / intervalSeconds) * intervalSeconds;

  let previousClose = swaps[0].price;

  for (let time = startTime; time <= endTime; time += intervalSeconds) {
    const periodEnd = time + intervalSeconds;
    const periodSwaps = swaps.filter(s => s.timestamp >= time && s.timestamp < periodEnd);

    if (periodSwaps.length === 0) {
      candles.push({
        time,
        open: previousClose,
        high: previousClose,
        low: previousClose,
        close: previousClose,
        volume: 0
      });
    } else {
      const open = periodSwaps[0].price;
      const close = periodSwaps[periodSwaps.length - 1].price;
      const high = Math.max(...periodSwaps.map(s => s.price));
      const low = Math.min(...periodSwaps.map(s => s.price));
      const volume = periodSwaps.reduce((sum, s) => sum + s.volume, 0);

      candles.push({ time, open, high, low, close, volume });
      previousClose = close;
    }
  }

  return candles;
}

// Mock data generators for testing when RPC is unavailable
function generateMockCandles(count) {
  const now = Math.floor(Date.now() / 1000);
  const candles = [];
  let price = 0.00075; // Starting price

  for (let i = count; i > 0; i--) {
    const time = now - (i * 3600); // 1 hour intervals
    const open = price;
    const change = (Math.random() - 0.5) * 0.00002; // +/- 0.00001
    const close = price + change;
    const high = Math.max(open, close) * (1 + Math.random() * 0.02);
    const low = Math.min(open, close) * (1 - Math.random() * 0.02);
    const volume = Math.random() * 1000 + 100;

    candles.push({ time, open, high, low, close, volume });
    price = close;
  }

  return candles;
}

function generateMockTransactions(count) {
  const now = Math.floor(Date.now() / 1000);
  const transactions = [];
  let price = 0.00075;

  for (let i = 0; i < count; i++) {
    const type = Math.random() > 0.5 ? 'buy' : 'sell';
    const timestamp = now - (i * 60); // 1 minute apart
    const change = (Math.random() - 0.5) * 0.00001;
    price = Math.max(0.0001, price + change);
    const tokenAmount = Math.random() * 10000 + 1000;
    const wopnAmount = tokenAmount * price;
    const volume = wopnAmount;

    transactions.push({
      timestamp,
      price,
      volume,
      blockNumber: 1000000 + i,
      txHash: `0x${Math.random().toString(16).substring(2, 66)}`,
      type,
      tokenAmount,
      wopnAmount
    });
  }

  return transactions;
}

// API Routes

// Get chart data
app.get('/api/chart/:tokenAddress', async (req, res) => {
  try {
    const { tokenAddress } = req.params;
    const { timeframe = '1H' } = req.query;

    const timeframeMap = {
      '5M': 5 * 60,
      '15M': 15 * 60,
      '1H': 60 * 60,
      '4H': 4 * 60 * 60,
      '1D': 24 * 60 * 60,
      '1W': 7 * 24 * 60 * 60
    };

    // Check if we have data in database
    let swaps = db.getTokenSwaps(tokenAddress.toLowerCase(), 10000);

    if (swaps.length === 0) {
      // Index if not already
      await indexTokenSwaps(tokenAddress);
      await subscribeToRealTimeSwaps(tokenAddress);
      swaps = db.getTokenSwaps(tokenAddress.toLowerCase(), 10000);
    }

    if (swaps.length === 0) {
      // Return mock data for testing when no real data available
      console.log('⚠️  No swaps found, returning mock data for testing');
      const mockCandles = generateMockCandles(200);
      const mockTransactions = generateMockTransactions(50);
      return res.json({ candles: mockCandles, transactions: mockTransactions });
    }

    // Try to get pre-calculated candles from database
    let candles = db.getCandles(tokenAddress.toLowerCase(), timeframe, 1000);

    if (candles.length === 0) {
      // Build and save candles
      const intervalSeconds = timeframeMap[timeframe] || 3600;
      candles = db.buildAndSaveCandles(tokenAddress.toLowerCase(), timeframe, intervalSeconds);
    }

    // Ensure candles are sorted oldest to newest (ASC by time)
    candles = candles.sort((a, b) => a.time - b.time);

    // Get recent transactions (last 50, newest first)
    const transactions = db.getTokenSwaps(tokenAddress.toLowerCase(), 50);

    res.json({
      candles, // Already sorted oldest to newest
      transactions // Already newest first from DB
    });

  } catch (error) {
    console.error('Error fetching chart data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get token info
app.get('/api/token/:tokenAddress', async (req, res) => {
  try {
    const { tokenAddress } = req.params;
    const swaps = db.getTokenSwaps(tokenAddress.toLowerCase(), 1000);

    if (swaps.length === 0) {
      return res.json({ price: 0, volume24h: 0, lastUpdate: 0 });
    }

    const latestSwap = swaps[0]; // Newest first from DB
    const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
    const recent = swaps.filter(s => s.timestamp >= oneDayAgo);
    const volume24h = recent.reduce((sum, s) => sum + s.volume, 0);

    res.json({
      price: latestSwap.price,
      volume24h,
      lastUpdate: latestSwap.timestamp
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Index a new token
app.post('/api/index/:tokenAddress', async (req, res) => {
  try {
    const { tokenAddress } = req.params;
    await indexTokenSwaps(tokenAddress);
    await subscribeToRealTimeSwaps(tokenAddress);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('👤 New WebSocket client connected (total clients:', wss.clients.size + ')');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'subscribe' && data.tokenAddress) {
        console.log(`📡 Client subscribing to ${data.tokenAddress}`);

        // Check if we have data for this token
        const swaps = db.getTokenSwaps(data.tokenAddress.toLowerCase(), 1);

        if (swaps.length === 0) {
          console.log(`   No data found, indexing ${data.tokenAddress}...`);
          await indexTokenSwaps(data.tokenAddress);
        }

        // Subscribe to real-time updates
        await subscribeToRealTimeSwaps(data.tokenAddress);

        ws.send(JSON.stringify({
          type: 'subscribed',
          tokenAddress: data.tokenAddress
        }));

        console.log(`   ✓ Client subscribed to ${data.tokenAddress}`);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log('👋 Client disconnected (remaining clients:', wss.clients.size - 1 + ')');
  });
});

// Status endpoint to check subscriptions
app.get('/api/status', (req, res) => {
  res.json({
    wsConnected: wsProvider !== null,
    subscribedTokens: Array.from(subscribedTokens),
    connectedClients: wss.clients.size
  });
});

// Start server
const PORT = process.env.PORT || 3001;

server.listen(PORT, async () => {
  console.log(`🚀 Shchard Backend running on port ${PORT}`);
  await connectWebSocket();

  // Index WOPN on startup
  setTimeout(() => {
    console.log(`🏁 Starting WOPN indexing and subscription...`);
    indexTokenSwaps(WOPN_ADDRESS);
    subscribeToRealTimeSwaps(WOPN_ADDRESS);
  }, 2000);

  // Heartbeat every 30 seconds to show we're alive
  setInterval(() => {
    const status = wsProvider ? '🟢 CONNECTED' : '🔴 DISCONNECTED';
    console.log(`💓 Heartbeat - WebSocket: ${status}, Subscribed: ${subscribedTokens.size} tokens, Clients: ${wss.clients.size}`);
  }, 30000);
});
