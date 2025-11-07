import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import dotenv from 'dotenv';
import Redis from 'redis';
import * as db from './database.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3001;
const WORKER_ID = process.env.pm_id || process.pid;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log(`\n🚀 Shchard API Worker ${WORKER_ID} Starting...\n`);

// Initialize database (read-only for API workers)
db.initializeDatabase();
console.log('✅ Database initialized (read-only)');

// Redis subscriber for real-time events
let redisSubscriber = null;

async function connectRedis() {
  try {
    redisSubscriber = Redis.createClient({ url: REDIS_URL });

    redisSubscriber.on('error', (err) => {
      console.error('❌ Redis error:', err.message);
    });

    redisSubscriber.on('connect', () => {
      console.log('✅ Redis connected for subscribing');
    });

    await redisSubscriber.connect();

    // Subscribe to swap events from indexer worker
    await redisSubscriber.subscribe('swaps:new', (message) => {
      try {
        const swapData = JSON.parse(message);

        // Broadcast to all connected WebSocket clients
        let broadcastCount = 0;
        wss.clients.forEach((client) => {
          if (client.readyState === 1) { // OPEN
            client.send(message);
            broadcastCount++;
          }
        });

        if (broadcastCount > 0) {
          console.log(`📡 Broadcast swap ${swapData.data.txHash.substring(0, 10)}... to ${broadcastCount} clients`);
        }
      } catch (error) {
        console.error('❌ Failed to process swap message:', error.message);
      }
    });

    console.log('✅ Subscribed to Redis swap channel');

  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    console.log('⚠️  Real-time updates will not work without Redis');
  }
}

// Timeframe mapping
const timeframeMap = {
  '1M': 60,
  '5M': 5 * 60,
  '15M': 15 * 60
};

// API Routes

// Get chart data
app.get('/api/chart/:tokenAddress', async (req, res) => {
  try {
    const { tokenAddress } = req.params;
    const { timeframe = '5M' } = req.query;

    console.log(`\n📊 Chart API Request: ${tokenAddress} | Timeframe: ${timeframe}`);

    let swaps = db.getTokenSwaps(tokenAddress.toLowerCase(), 10000);
    console.log(`   Found ${swaps.length} swaps in database`);

    if (swaps.length === 0) {
      const token = db.getToken(tokenAddress.toLowerCase());

      return res.json({
        candles: [],
        transactions: [],
        tokenMetadata: {
          name: token?.name || 'Loading...',
          symbol: token?.symbol || 'LOADING',
          decimals: token?.decimals || 18
        },
        message: token
          ? 'Token indexed, waiting for swap data'
          : 'Token will be automatically indexed when discovered'
      });
    }

    // Get or build candles
    let candles = db.getCandles(tokenAddress.toLowerCase(), timeframe, 100000);

    if (candles.length === 0) {
      const intervalSeconds = timeframeMap[timeframe] || 3600;
      const buildStart = Date.now();
      candles = db.buildAndSaveCandles(tokenAddress.toLowerCase(), timeframe, intervalSeconds);
      const buildTime = Date.now() - buildStart;
      console.log(`   ✅ Built ${candles.length} candles in ${buildTime}ms`);
    } else {
      console.log(`   ✅ Using ${candles.length} cached candles`);
    }

    // Sort and format candles
    candles = candles.sort((a, b) => (a.timestamp || a.time) - (b.timestamp || b.time));
    candles = candles.map(c => ({
      time: c.timestamp || c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume
    }));

    // Get recent transactions
    const transactions = db.getTokenSwaps(tokenAddress.toLowerCase(), 50);

    // Get token metadata
    const token = db.getToken(tokenAddress.toLowerCase());
    const tokenMetadata = token ? {
      name: token.name,
      symbol: token.symbol,
      decimals: token.decimals
    } : {
      name: 'Unknown',
      symbol: 'UNKNOWN',
      decimals: 18
    };

    res.json({
      candles,
      transactions,
      tokenMetadata
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

    const latestSwap = swaps[0];
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

// Status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    worker: WORKER_ID,
    uptime: process.uptime(),
    connectedClients: wss.clients.size,
    tokensCount: db.getAllTokens().length,
    lastIndexedBlock: db.getLastIndexedBlockGlobal(),
    redis: redisSubscriber?.isOpen ? 'connected' : 'disconnected'
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', worker: WORKER_ID });
});

// WebSocket connection handler
wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;
  const clientID = Math.random().toString(36).substring(7);

  console.log(`👤 Client [${clientID}] connected from ${clientIP} (total: ${wss.clients.size})`);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'subscribe' && data.tokenAddress) {
        const swaps = db.getTokenSwaps(data.tokenAddress.toLowerCase(), 1);

        ws.send(JSON.stringify({
          type: 'subscribed',
          tokenAddress: data.tokenAddress,
          hasData: swaps.length > 0
        }));
      }
    } catch (error) {
      console.error(`WebSocket message error from [${clientID}]:`, error);
    }
  });

  ws.on('close', () => {
    console.log(`👋 Client [${clientID}] disconnected (remaining: ${wss.clients.size})`);
  });

  ws.on('error', (error) => {
    console.error(`❌ WebSocket error from [${clientID}]:`, error.message);
  });
});

// Start server
server.listen(PORT, async () => {
  console.log(`🚀 API Worker ${WORKER_ID} running on port ${PORT}`);

  // Connect to Redis
  await connectRedis();

  // Heartbeat
  setInterval(() => {
    console.log(`💓 Worker ${WORKER_ID} - Clients: ${wss.clients.size}, Redis: ${redisSubscriber?.isOpen ? '🟢' : '🔴'}`);
  }, 60000);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log(`\n⚠️  Worker ${WORKER_ID} received SIGTERM, shutting down...`);

  server.close(() => {
    console.log('HTTP server closed');
  });

  if (redisSubscriber) {
    await redisSubscriber.quit();
  }

  process.exit(0);
});
