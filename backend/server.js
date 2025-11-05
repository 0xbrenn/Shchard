import { ethers } from 'ethers';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

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

// In-memory data store
const swapDataStore = new Map(); // tokenAddress -> { swaps: [], lastIndexed: blockNumber }
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
  const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase();

  const currentBlock = await provider.getBlockNumber();
  const startBlock = fromBlock || Math.max(0, currentBlock - 50000); // Last 50k blocks

  console.log(`  Fetching from block ${startBlock} to ${currentBlock}`);

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

  const swaps = [];
  for (const event of allEvents) {
    const swap = await processSwapEvent(event, tokenAddress, isToken0);
    if (swap) swaps.push(swap);
  }

  // Sort by timestamp
  swaps.sort((a, b) => a.timestamp - b.timestamp);

  // Store in memory
  swapDataStore.set(tokenAddress.toLowerCase(), {
    swaps,
    lastIndexed: currentBlock,
    pairAddress,
    isToken0
  });

  console.log(`✅ Indexed ${swaps.length} swaps for ${tokenAddress}`);
  return swaps;
}

// Subscribe to real-time swaps
async function subscribeToRealTimeSwaps(tokenAddress) {
  try {
    if (!wsProvider) {
      console.log(`⚠️ WebSocket not connected, will retry subscription for ${tokenAddress} later`);
      // Retry after 10 seconds
      setTimeout(() => subscribeToRealTimeSwaps(tokenAddress), 10000);
      return;
    }

    const pairAddress = await findPair(tokenAddress);
    if (!pairAddress) return;

    const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, wsProvider);
    const token0 = await pairContract.token0();
    const isToken0 = token0.toLowerCase() === tokenAddress.toLowerCase();

    pairContract.on('Swap', async (...args) => {
      const event = args[args.length - 1];
      const swap = await processSwapEvent(event, tokenAddress, isToken0);

      if (swap) {
        console.log(`🔥 New swap detected for ${tokenAddress}`);

        // Add to store
        const data = swapDataStore.get(tokenAddress.toLowerCase());
        if (data) {
          data.swaps.push(swap);
        }

        // Broadcast to all connected WebSocket clients
        broadcastSwap(tokenAddress, swap);
      }
    });

    console.log(`🔌 Subscribed to real-time swaps for ${tokenAddress}`);
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

    let data = swapDataStore.get(tokenAddress.toLowerCase());

    if (!data || data.swaps.length === 0) {
      // Index if not already
      await indexTokenSwaps(tokenAddress);
      data = swapDataStore.get(tokenAddress.toLowerCase());
    }

    if (!data || data.swaps.length === 0) {
      return res.json({ candles: [], transactions: [] });
    }

    const intervalSeconds = timeframeMap[timeframe] || 3600;
    const candles = buildCandles(data.swaps, intervalSeconds);

    res.json({
      candles,
      transactions: data.swaps.slice(-50).reverse() // Last 50, newest first
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
    const data = swapDataStore.get(tokenAddress.toLowerCase());

    if (!data || data.swaps.length === 0) {
      return res.json({ price: 0, volume24h: 0 });
    }

    const latestSwap = data.swaps[data.swaps.length - 1];
    const oneDayAgo = Math.floor(Date.now() / 1000) - 24 * 60 * 60;
    const recent = data.swaps.filter(s => s.timestamp >= oneDayAgo);
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
  console.log('👤 New WebSocket client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'subscribe' && data.tokenAddress) {
        console.log(`📡 Client subscribing to ${data.tokenAddress}`);

        // Ensure token is indexed and subscribed
        let stored = swapDataStore.get(data.tokenAddress.toLowerCase());
        if (!stored) {
          await indexTokenSwaps(data.tokenAddress);
          await subscribeToRealTimeSwaps(data.tokenAddress);
        }

        ws.send(JSON.stringify({
          type: 'subscribed',
          tokenAddress: data.tokenAddress
        }));
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log('👋 Client disconnected');
  });
});

// Start server
const PORT = process.env.PORT || 3001;

server.listen(PORT, async () => {
  console.log(`🚀 Shchard Backend running on port ${PORT}`);
  await connectWebSocket();

  // Index WOPN on startup
  setTimeout(() => {
    indexTokenSwaps(WOPN_ADDRESS);
    subscribeToRealTimeSwaps(WOPN_ADDRESS);
  }, 2000);
});
