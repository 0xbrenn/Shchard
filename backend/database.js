import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database
const dbPath = path.join(__dirname, 'shchard.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Create tables immediately to ensure they exist for prepared statements
function initializeDatabase() {
  // Tokens table
  db.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      address TEXT PRIMARY KEY,
      name TEXT,
      symbol TEXT,
      decimals INTEGER DEFAULT 18,
      pair_address TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Pairs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pairs (
      address TEXT PRIMARY KEY,
      token0 TEXT NOT NULL,
      token1 TEXT NOT NULL,
      token0_symbol TEXT,
      token1_symbol TEXT,
      reserve0 TEXT,
      reserve1 TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      last_updated INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `);

  // Swaps table - stores all swap transactions
  db.exec(`
    CREATE TABLE IF NOT EXISTS swaps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_hash TEXT NOT NULL,
      pair_address TEXT NOT NULL,
      token_address TEXT NOT NULL,
      block_number INTEGER NOT NULL,
      timestamp INTEGER NOT NULL,
      price REAL NOT NULL,
      volume REAL NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('buy', 'sell')),
      token_amount REAL NOT NULL,
      wopn_amount REAL NOT NULL,
      UNIQUE(tx_hash, pair_address)
    )
  `);

  // Candles table - pre-calculated OHLCV data
  db.exec(`
    CREATE TABLE IF NOT EXISTS candles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_address TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL,
      UNIQUE(token_address, timeframe, timestamp)
    )
  `);

  // Create indexes for faster queries
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_swaps_token ON swaps(token_address, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_swaps_pair ON swaps(pair_address, timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_swaps_block ON swaps(block_number);
    CREATE INDEX IF NOT EXISTS idx_candles_token_time ON candles(token_address, timeframe, timestamp DESC);
  `);

  console.log('✅ Database initialized');
}

// Initialize database immediately so tables exist for prepared statements
initializeDatabase();

// Token operations
const tokenQueries = {
  upsert: db.prepare(`
    INSERT INTO tokens (address, name, symbol, decimals, pair_address)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      name = excluded.name,
      symbol = excluded.symbol,
      decimals = excluded.decimals,
      pair_address = excluded.pair_address
  `),

  getByAddress: db.prepare(`
    SELECT * FROM tokens WHERE address = ?
  `),

  getAll: db.prepare(`
    SELECT * FROM tokens ORDER BY created_at DESC
  `)
};

// Pair operations
const pairQueries = {
  upsert: db.prepare(`
    INSERT INTO pairs (address, token0, token1, token0_symbol, token1_symbol, reserve0, reserve1, last_updated)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(address) DO UPDATE SET
      reserve0 = excluded.reserve0,
      reserve1 = excluded.reserve1,
      last_updated = excluded.last_updated
  `),

  getByAddress: db.prepare(`
    SELECT * FROM pairs WHERE address = ?
  `),

  getAll: db.prepare(`
    SELECT * FROM pairs ORDER BY last_updated DESC
  `),

  getByToken: db.prepare(`
    SELECT * FROM pairs WHERE token0 = ? OR token1 = ?
  `)
};

// Swap operations
const swapQueries = {
  insert: db.prepare(`
    INSERT OR IGNORE INTO swaps
    (tx_hash, pair_address, token_address, block_number, timestamp, price, volume, type, token_amount, wopn_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `),

  getByToken: db.prepare(`
    SELECT * FROM swaps
    WHERE token_address = ?
    ORDER BY timestamp DESC
    LIMIT ?
  `),

  getByTokenAfterBlock: db.prepare(`
    SELECT * FROM swaps
    WHERE token_address = ? AND block_number > ?
    ORDER BY timestamp ASC
  `),

  getLastBlockForToken: db.prepare(`
    SELECT MAX(block_number) as last_block FROM swaps WHERE token_address = ?
  `),

  getSwapsInRange: db.prepare(`
    SELECT * FROM swaps
    WHERE token_address = ? AND timestamp >= ? AND timestamp <= ?
    ORDER BY timestamp ASC
  `)
};

// Candle operations
const candleQueries = {
  upsert: db.prepare(`
    INSERT INTO candles (token_address, timeframe, timestamp, open, high, low, close, volume)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(token_address, timeframe, timestamp) DO UPDATE SET
      open = excluded.open,
      high = excluded.high,
      low = excluded.low,
      close = excluded.close,
      volume = excluded.volume
  `),

  getByTokenAndTimeframe: db.prepare(`
    SELECT * FROM candles
    WHERE token_address = ? AND timeframe = ?
    ORDER BY timestamp ASC
    LIMIT ?
  `),

  deleteOldCandles: db.prepare(`
    DELETE FROM candles
    WHERE token_address = ? AND timeframe = ? AND timestamp < ?
  `)
};

// Helper functions
function insertSwap(swap) {
  return swapQueries.insert.run(
    swap.txHash,
    swap.pairAddress,
    swap.tokenAddress,
    swap.blockNumber,
    swap.timestamp,
    swap.price,
    swap.volume,
    swap.type,
    swap.tokenAmount,
    swap.wopnAmount
  );
}

function insertSwapsBatch(swaps) {
  const insertMany = db.transaction((swapsList) => {
    for (const swap of swapsList) {
      insertSwap(swap);
    }
  });

  return insertMany(swaps);
}

function getTokenSwaps(tokenAddress, limit = 50) {
  return swapQueries.getByToken.all(tokenAddress, limit);
}

function getLastIndexedBlock(tokenAddress) {
  const result = swapQueries.getLastBlockForToken.get(tokenAddress);
  return result?.last_block || null;
}

function upsertToken(token) {
  return tokenQueries.upsert.run(
    token.address,
    token.name,
    token.symbol,
    token.decimals,
    token.pairAddress
  );
}

function upsertPair(pair) {
  return pairQueries.upsert.run(
    pair.address,
    pair.token0,
    pair.token1,
    pair.token0Symbol,
    pair.token1Symbol,
    pair.reserve0,
    pair.reserve1,
    Math.floor(Date.now() / 1000)
  );
}

// Build candles from swaps
function buildAndSaveCandles(tokenAddress, timeframe, intervalSeconds) {
  const swaps = swapQueries.getByToken.all(tokenAddress, 10000); // Get more swaps for accurate candles
  console.log(`      🏗️  Building candles: ${swaps.length} swaps, ${intervalSeconds}s interval`);

  if (swaps.length === 0) {
    console.log(`      ❌ No swaps to build candles from`);
    return [];
  }

  // First, build candles from actual swaps
  const swapCandles = {};

  for (const swap of swaps) {
    const candleTime = Math.floor(swap.timestamp / intervalSeconds) * intervalSeconds;

    if (!swapCandles[candleTime]) {
      swapCandles[candleTime] = {
        open: swap.price,
        high: swap.price,
        low: swap.price,
        close: swap.price,
        volume: swap.volume
      };
    } else {
      swapCandles[candleTime].high = Math.max(swapCandles[candleTime].high, swap.price);
      swapCandles[candleTime].low = Math.min(swapCandles[candleTime].low, swap.price);
      swapCandles[candleTime].close = swap.price;
      swapCandles[candleTime].volume += swap.volume;
    }
  }

  // Now fill in gaps with zero-volume candles using previous close
  const firstTimestamp = swaps[0].timestamp;
  const now = Math.floor(Date.now() / 1000);
  const lastTimestamp = Math.max(swaps[swaps.length - 1].timestamp, now - (intervalSeconds * 100));
  const startTime = Math.floor(firstTimestamp / intervalSeconds) * intervalSeconds;
  const endTime = Math.floor(lastTimestamp / intervalSeconds) * intervalSeconds;

  let previousClose = swaps[0].price;
  const allCandles = {};

  for (let time = startTime; time <= endTime; time += intervalSeconds) {
    if (swapCandles[time]) {
      // Use actual swap candle
      allCandles[time] = swapCandles[time];
      previousClose = swapCandles[time].close;
    } else {
      // Fill gap with zero-volume candle
      allCandles[time] = {
        open: previousClose,
        high: previousClose,
        low: previousClose,
        close: previousClose,
        volume: 0
      };
    }
  }

  // Save candles to database
  const insertCandles = db.transaction((candlesList) => {
    for (const [timestamp, candle] of Object.entries(candlesList)) {
      candleQueries.upsert.run(
        tokenAddress,
        timeframe,
        parseInt(timestamp),
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume
      );
    }
  });

  insertCandles(allCandles);

  const candleArray = Object.entries(allCandles).map(([timestamp, candle]) => ({
    time: parseInt(timestamp),
    ...candle
  })).sort((a, b) => a.time - b.time);

  console.log(`      ✅ Saved ${candleArray.length} candles to database`);
  console.log(`      Time range: ${new Date(candleArray[0].time * 1000).toISOString()} to ${new Date(candleArray[candleArray.length - 1].time * 1000).toISOString()}`);

  // Return candles array
  return candleArray;
}

function getCandles(tokenAddress, timeframe, limit = 1000) {
  return candleQueries.getByTokenAndTimeframe.all(tokenAddress, timeframe, limit);
}

function getAllTokens() {
  return tokenQueries.getAll.all();
}

function getAllPairs() {
  return pairQueries.getAll.all();
}

export {
  db,
  initializeDatabase,

  // Token functions
  upsertToken,
  getAllTokens,

  // Pair functions
  upsertPair,
  getAllPairs,

  // Swap functions
  insertSwap,
  insertSwapsBatch,
  getTokenSwaps,
  getLastIndexedBlock,

  // Candle functions
  buildAndSaveCandles,
  getCandles
};

export const getToken = (address) => tokenQueries.getByAddress.get(address);
export const getPair = (address) => pairQueries.getByAddress.get(address);
export const getTokenPair = (tokenAddress) => pairQueries.getByToken.get(tokenAddress, tokenAddress);
export const getSwapsInRange = (tokenAddress, startTime, endTime) =>
  swapQueries.getSwapsInRange.all(tokenAddress, startTime, endTime);
