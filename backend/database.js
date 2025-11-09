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

  // Indexer state table - tracks indexing progress
  db.exec(`
    CREATE TABLE IF NOT EXISTS indexer_state (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
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
    ORDER BY timestamp DESC
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
  const startBuildTime = Date.now();

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

  console.log(`      ✓ Built ${Object.keys(swapCandles).length} candles with swap data`);

  // Build candles from first swap to current time for complete historical data
  const now = Math.floor(Date.now() / 1000);

  // Note: swaps are ordered DESC (newest first), so swaps[swaps.length-1] is oldest
  const firstTimestamp = swaps[swaps.length - 1].timestamp; // Oldest swap
  const newestTimestamp = swaps[0].timestamp; // Newest swap

  // Start from the very first swap
  const startTime = Math.floor(firstTimestamp / intervalSeconds) * intervalSeconds;

  // End at current time so charts always show up-to-date state
  const endTime = Math.floor(now / intervalSeconds) * intervalSeconds;

  const timeRangeDays = (endTime - startTime) / (24 * 60 * 60);
  const maxCandles = Math.ceil((endTime - startTime) / intervalSeconds);

  console.log(`      Time range: ${timeRangeDays.toFixed(1)} days (${maxCandles} candles max)`);

  // Safety check: Don't create more than 100,000 candles
  if (maxCandles > 100000) {
    console.log(`      ⚠️  Too many candles (${maxCandles}), limiting to recent 50,000`);
    const limitedStartTime = endTime - (50000 * intervalSeconds);
    return buildCandlesInRange(tokenAddress, timeframe, intervalSeconds, swapCandles, limitedStartTime, endTime);
  }

  return buildCandlesInRange(tokenAddress, timeframe, intervalSeconds, swapCandles, startTime, endTime);
}

// Helper function to build candles in a specific time range
function buildCandlesInRange(tokenAddress, timeframe, intervalSeconds, swapCandles, startTime, endTime) {
  const allCandles = {};
  let previousClose = null;

  // Find the first price to use for filling
  const sortedTimes = Object.keys(swapCandles).map(t => parseInt(t)).sort((a, b) => a - b);
  if (sortedTimes.length > 0) {
    previousClose = swapCandles[sortedTimes[0]].open;
  }

  for (let time = startTime; time <= endTime; time += intervalSeconds) {
    if (swapCandles[time]) {
      // Use actual swap candle
      allCandles[time] = swapCandles[time];
      previousClose = swapCandles[time].close;
    } else if (previousClose !== null) {
      // Fill gap with zero-volume candle (only if we have a previous price)
      allCandles[time] = {
        open: previousClose,
        high: previousClose,
        low: previousClose,
        close: previousClose,
        volume: 0
      };
    }
  }

  console.log(`      ✓ Created ${Object.keys(allCandles).length} total candles (includes fills)`);

  // Save candles to database in a transaction
  const insertStart = Date.now();
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
  const insertTime = Date.now() - insertStart;

  const candleArray = Object.entries(allCandles).map(([timestamp, candle]) => ({
    time: parseInt(timestamp),
    ...candle
  })).sort((a, b) => a.time - b.time);

  console.log(`      ✅ Saved ${candleArray.length} candles in ${insertTime}ms`);

  if (candleArray.length > 0) {
    console.log(`      Time range: ${new Date(candleArray[0].time * 1000).toISOString()} to ${new Date(candleArray[candleArray.length - 1].time * 1000).toISOString()}`);
  }

  // Return candles array
  return candleArray;
}

function getCandles(tokenAddress, timeframe, limit = 100000) {
  const candles = candleQueries.getByTokenAndTimeframe.all(tokenAddress, timeframe, limit);
  // Query returns newest first (DESC), reverse to get chronological order for frontend
  return candles.reverse();
}

function getAllTokens() {
  return tokenQueries.getAll.all();
}

function getAllPairs() {
  return pairQueries.getAll.all();
}

// Indexer state queries
const indexerStateQueries = {
  get: db.prepare(`
    SELECT value FROM indexer_state WHERE key = ?
  `),
  set: db.prepare(`
    INSERT INTO indexer_state (key, value, updated_at)
    VALUES (?, ?, strftime('%s', 'now'))
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `)
};

// Indexer state functions
function getLastIndexedBlockGlobal() {
  const result = indexerStateQueries.get.get('last_indexed_block');
  return result?.value || null;
}

function setLastIndexedBlockGlobal(blockNumber) {
  return indexerStateQueries.set.run('last_indexed_block', blockNumber);
}

// Build candles progressively with streaming batches
function buildCandlesProgressively(tokenAddress, timeframe, intervalSeconds, onBatchCallback) {
  const BATCH_SIZE = 100; // Send 100 candles at a time
  const swaps = swapQueries.getByToken.all(tokenAddress, 10000);

  if (swaps.length === 0) {
    console.log(`      ❌ No swaps to build candles from`);
    return;
  }

  // Build swap candles first (quick)
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

  // Calculate time range - build from first swap to now for complete history
  const now = Math.floor(Date.now() / 1000);
  const firstTimestamp = swaps[swaps.length - 1].timestamp;
  const startTime = Math.floor(firstTimestamp / intervalSeconds) * intervalSeconds;
  const endTime = Math.floor(now / intervalSeconds) * intervalSeconds;

  const totalCandles = Math.ceil((endTime - startTime) / intervalSeconds);
  console.log(`      🏗️  Progressive build: ${totalCandles} candles in batches of ${BATCH_SIZE}`);

  let candlesBuilt = 0;
  let batchIndex = 0;
  let previousClose = null;

  // Find first price
  const sortedTimes = Object.keys(swapCandles).map(t => parseInt(t)).sort((a, b) => a - b);
  if (sortedTimes.length > 0) {
    previousClose = swapCandles[sortedTimes[0]].open;
  }

  // Build and stream in batches
  for (let batchStart = startTime; batchStart <= endTime; batchStart += intervalSeconds * BATCH_SIZE) {
    const batchCandles = [];
    const batchEnd = Math.min(batchStart + (intervalSeconds * BATCH_SIZE), endTime + intervalSeconds);

    for (let time = batchStart; time < batchEnd && time <= endTime; time += intervalSeconds) {
      let candle;
      if (swapCandles[time]) {
        candle = swapCandles[time];
        previousClose = candle.close;
      } else if (previousClose !== null) {
        candle = {
          open: previousClose,
          high: previousClose,
          low: previousClose,
          close: previousClose,
          volume: 0
        };
      } else {
        continue;
      }

      // Save to database
      candleQueries.upsert.run(
        tokenAddress,
        timeframe,
        time,
        candle.open,
        candle.high,
        candle.low,
        candle.close,
        candle.volume
      );

      batchCandles.push({
        time,
        ...candle
      });

      candlesBuilt++;
    }

    // Call callback with batch
    if (batchCandles.length > 0 && onBatchCallback) {
      onBatchCallback({
        batch: batchIndex,
        candles: batchCandles,
        progress: {
          current: candlesBuilt,
          total: totalCandles,
          percent: Math.floor((candlesBuilt / totalCandles) * 100)
        }
      });
    }

    batchIndex++;
  }

  console.log(`      ✅ Progressive build complete: ${candlesBuilt} candles in ${batchIndex} batches`);
}

// Update candles in real-time when a new swap arrives
function updateCandlesWithSwap(swap) {
  const timeframeMap = {
    '1M': 60,
    '5M': 5 * 60,
    '15M': 15 * 60,
    '30M': 30 * 60,
    '1H': 60 * 60,
    '2H': 2 * 60 * 60,
    '4H': 4 * 60 * 60,
    '12H': 12 * 60 * 60,
    '1D': 24 * 60 * 60
  };

  const updatedCandles = [];
  const tokenAddress = swap.tokenAddress.toLowerCase();

  // Update candles for all timeframes
  for (const [timeframe, intervalSeconds] of Object.entries(timeframeMap)) {
    // Calculate which candle this swap belongs to
    const candleTimestamp = Math.floor(swap.timestamp / intervalSeconds) * intervalSeconds;

    // Get existing candle or create new one
    const existingCandle = db.prepare(`
      SELECT * FROM candles
      WHERE token_address = ? AND timeframe = ? AND timestamp = ?
    `).get(tokenAddress, timeframe, candleTimestamp);

    let candle;
    if (existingCandle) {
      // Update existing candle
      candle = {
        open: existingCandle.open,
        high: Math.max(existingCandle.high, swap.price),
        low: Math.min(existingCandle.low, swap.price),
        close: swap.price, // Most recent price
        volume: existingCandle.volume + swap.volume
      };
    } else {
      // Create new candle
      candle = {
        open: swap.price,
        high: swap.price,
        low: swap.price,
        close: swap.price,
        volume: swap.volume
      };
    }

    // Upsert candle to database
    candleQueries.upsert.run(
      tokenAddress,
      timeframe,
      candleTimestamp,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume
    );

    // Add to updated list for broadcasting
    updatedCandles.push({
      timeframe,
      timestamp: candleTimestamp,
      ...candle
    });
  }

  return updatedCandles;
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
  buildCandlesProgressively,
  getCandles,
  updateCandlesWithSwap,

  // Indexer state functions
  getLastIndexedBlockGlobal,
  setLastIndexedBlockGlobal
};

export const getToken = (address) => tokenQueries.getByAddress.get(address);
export const getPair = (address) => pairQueries.getByAddress.get(address);
export const getTokenPair = (tokenAddress) => pairQueries.getByToken.get(tokenAddress, tokenAddress);
export const getSwapsInRange = (tokenAddress, startTime, endTime) =>
  swapQueries.getSwapsInRange.all(tokenAddress, startTime, endTime);
