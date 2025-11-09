import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🔧 Candle Rebuild Script\n');

// Open database
const dbPath = path.join(__dirname, 'shchard.db');
console.log(`📂 Database: ${dbPath}\n`);

const db = new Database(dbPath);

// Check database stats
const swapCount = db.prepare('SELECT COUNT(*) as count FROM swaps').get();
const candleCount = db.prepare('SELECT COUNT(*) as count FROM candles').get();
console.log(`📊 Current Database Stats:`);
console.log(`   Swaps: ${swapCount.count.toLocaleString()}`);
console.log(`   Candles: ${candleCount.count.toLocaleString()}\n`);

// Get all unique tokens that have swaps
console.log('📊 Finding all tokens with swap data...');
const tokens = db.prepare(`
  SELECT DISTINCT token_address, COUNT(*) as swap_count
  FROM swaps
  GROUP BY token_address
  ORDER BY swap_count DESC
`).all();

console.log(`   Found ${tokens.length} tokens\n`);

// All timeframes to rebuild
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

// Step 1: Delete all existing candles
console.log('🗑️  Deleting all existing candles...');
const deleteResult = db.prepare('DELETE FROM candles').run();
console.log(`   Deleted ${deleteResult.changes} candles\n`);

// Step 2: Rebuild candles for each token and timeframe
let totalRebuilt = 0;

for (let i = 0; i < tokens.length; i++) {
  const { token_address, swap_count } = tokens[i];
  console.log(`\n🪙 Token ${i + 1}/${tokens.length}: ${token_address}`);
  console.log(`   ${swap_count.toLocaleString()} swaps`);

  // Get all swaps for this token (ordered ASC - oldest first)
  const swaps = db.prepare(`
    SELECT * FROM swaps
    WHERE token_address = ?
    ORDER BY timestamp ASC
  `).all(token_address);

  if (swaps.length === 0) {
    console.log('   ⚠️  Skipping - no swaps');
    continue;
  }

  // Rebuild each timeframe
  for (const [timeframe, intervalSeconds] of Object.entries(timeframeMap)) {
    console.log(`   📈 Building ${timeframe} candles...`);

    // Build swap candles
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
        swapCandles[candleTime].close = swap.price; // Last swap in candle period
        swapCandles[candleTime].volume += swap.volume;
      }
    }

    // Calculate time range
    const now = Math.floor(Date.now() / 1000);
    const firstTimestamp = swaps[0].timestamp; // Oldest swap (ASC order)
    const startTime = Math.floor(firstTimestamp / intervalSeconds) * intervalSeconds;
    const endTime = Math.floor(now / intervalSeconds) * intervalSeconds;

    // Build complete candles with gap-filling
    let previousClose = null;
    const sortedTimes = Object.keys(swapCandles).map(t => parseInt(t)).sort((a, b) => a - b);
    if (sortedTimes.length > 0) {
      previousClose = swapCandles[sortedTimes[0]].open;
    }

    const insertCandle = db.prepare(`
      INSERT OR REPLACE INTO candles
      (token_address, timeframe, timestamp, open, high, low, close, volume)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let candleCount = 0;
    const insertAll = db.transaction((candles) => {
      for (const candle of candles) {
        insertCandle.run(
          candle.token_address,
          candle.timeframe,
          candle.timestamp,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume
        );
      }
    });

    const candlesToInsert = [];
    for (let time = startTime; time <= endTime; time += intervalSeconds) {
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

      candlesToInsert.push({
        token_address,
        timeframe,
        timestamp: time,
        ...candle
      });
      candleCount++;
    }

    insertAll(candlesToInsert);
    totalRebuilt += candleCount;
    console.log(`      ✅ Built ${candleCount} candles`);
  }
}

console.log(`\n\n✅ Rebuild Complete!`);
console.log(`   Total candles rebuilt: ${totalRebuilt}`);
console.log(`   Tokens processed: ${tokens.length}`);
console.log(`\n🚀 Charts should now display correctly!\n`);

db.close();
