# Progressive Candle Loading Architecture

## Problem

Current system waits for ALL candles to build before sending to frontend:
```
User requests chart → Backend builds 5000 candles → 30 seconds → Send all at once
```

This causes:
- Blank screen for 30+ seconds
- Poor UX (user thinks it's broken)
- Wasted time (could start rendering immediately)

## Solution: Stream Candles as They're Built

```
User requests chart
  ↓
Backend sends immediate response: {status: 'building', candles: [], transactions: [...]}
  ↓
Backend builds candles in batches of 100
  ↓
After each 100 candles → Stream to frontend via WebSocket
  ↓
Frontend appends new candles → Chart updates in real-time
  ↓
Backend finishes → Sends final {status: 'complete'} message
```

**Result**: Chart starts rendering in 1-2 seconds instead of 30 seconds!

## Data Flow

### Scenario 1: Cached Candles (Instant)

```
GET /api/chart/0xabc...?timeframe=1H
  ↓
Backend checks database
  ↓
Found 1000 cached candles
  ↓
INSTANT RESPONSE:
{
  status: 'complete',
  candles: [1000 candles],
  transactions: [50 swaps],
  tokenMetadata: {...}
}
  ↓
Chart renders immediately ✅
```

### Scenario 2: No Cached Candles (Progressive)

```
GET /api/chart/0xabc...?timeframe=1H
  ↓
Backend checks database
  ↓
No candles found, start building
  ↓
IMMEDIATE RESPONSE (< 100ms):
{
  status: 'building',
  candles: [],
  transactions: [50 swaps],
  tokenMetadata: {...},
  buildJob: 'job-123-abc' // Job ID for tracking
}
  ↓
Frontend subscribes to WebSocket: ws.subscribe('candles:job-123-abc')
  ↓
Backend builds candles in background:
  - Build candles 0-99 → Send via WebSocket
  - Build candles 100-199 → Send via WebSocket
  - Build candles 200-299 → Send via WebSocket
  - ...
  - Build candles 900-999 → Send via WebSocket
  ↓
Frontend receives each batch:
  - Batch 1 arrives → Append to chart (chart renders with 100 candles)
  - Batch 2 arrives → Append to chart (chart now has 200 candles)
  - Batch 3 arrives → Append to chart (chart now has 300 candles)
  - ...
  ↓
Backend sends final message:
{
  type: 'candles:complete',
  buildJob: 'job-123-abc',
  totalCandles: 1000
}
  ↓
Chart fully rendered, shows loading indicator removed ✅
```

## WebSocket Message Format

### 1. Candle Batch Message

```javascript
{
  type: 'candles:batch',
  buildJob: 'job-123-abc',
  tokenAddress: '0xabc...',
  timeframe: '1H',
  batch: {
    index: 0,        // Batch number (0, 1, 2, ...)
    candles: [       // 100 candles
      {time: 1699000000, open: 0.001, high: 0.0012, low: 0.0009, close: 0.0011, volume: 1000},
      {time: 1699003600, open: 0.0011, high: 0.0013, low: 0.001, close: 0.0012, volume: 1500},
      // ... 98 more candles
    ],
    progress: {
      current: 100,  // Candles built so far
      total: 1000,   // Total candles to build
      percent: 10    // 10% complete
    }
  }
}
```

### 2. Build Complete Message

```javascript
{
  type: 'candles:complete',
  buildJob: 'job-123-abc',
  tokenAddress: '0xabc...',
  timeframe: '1H',
  totalCandles: 1000,
  buildTimeMs: 2500
}
```

### 3. Build Error Message

```javascript
{
  type: 'candles:error',
  buildJob: 'job-123-abc',
  tokenAddress: '0xabc...',
  timeframe: '1H',
  error: 'Failed to build candles: ...',
  partialCandles: 300 // How many were built before error
}
```

## Backend Implementation

### Modified Chart API Endpoint

```javascript
app.get('/api/chart/:tokenAddress', async (req, res) => {
  const { tokenAddress } = req.params;
  const { timeframe = '1H' } = req.query;

  const intervalSeconds = timeframeMap[timeframe];

  // Check for cached candles
  let candles = db.getCandles(tokenAddress.toLowerCase(), timeframe, 10000);

  if (candles.length > 0) {
    // CACHED - Return immediately
    console.log(`✅ Returning ${candles.length} cached candles`);
    return res.json({
      status: 'complete',
      candles: candles.map(c => ({...c, time: c.timestamp || c.time})),
      transactions: getFormattedTransactions(tokenAddress),
      tokenMetadata: getTokenMetadata(tokenAddress)
    });
  }

  // NO CACHED CANDLES - Start progressive build
  const swaps = db.getTokenSwaps(tokenAddress.toLowerCase(), 10000);

  if (swaps.length === 0) {
    return res.json({
      status: 'no_data',
      candles: [],
      transactions: [],
      tokenMetadata: getTokenMetadata(tokenAddress),
      message: 'No swaps found for this token'
    });
  }

  // Generate unique build job ID
  const buildJob = `job-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  console.log(`🏗️  Starting progressive candle build: ${buildJob}`);

  // Start building in background (non-blocking)
  setImmediate(() => {
    buildCandlesProgressively(tokenAddress, timeframe, intervalSeconds, buildJob);
  });

  // Return immediately with build job ID
  res.json({
    status: 'building',
    candles: [],
    transactions: getFormattedTransactions(tokenAddress),
    tokenMetadata: getTokenMetadata(tokenAddress),
    buildJob: buildJob
  });
});
```

### Progressive Candle Builder

```javascript
async function buildCandlesProgressively(tokenAddress, timeframe, intervalSeconds, buildJob) {
  const BATCH_SIZE = 100; // Send 100 candles at a time

  try {
    const swaps = db.getTokenSwaps(tokenAddress.toLowerCase(), 10000);

    // Build swap candles (quick)
    const swapCandles = buildSwapCandles(swaps, intervalSeconds);

    // Calculate time range
    const now = Math.floor(Date.now() / 1000);
    const maxHistorySeconds = 7 * 24 * 60 * 60;
    const firstTimestamp = swaps[swaps.length - 1].timestamp;
    const effectiveStartTime = Math.max(firstTimestamp, now - maxHistorySeconds);
    const startTime = Math.floor(effectiveStartTime / intervalSeconds) * intervalSeconds;
    const endTime = Math.floor(now / intervalSeconds) * intervalSeconds;

    const totalCandles = Math.ceil((endTime - startTime) / intervalSeconds);

    console.log(`   📊 Building ${totalCandles} candles in batches of ${BATCH_SIZE}`);

    const allCandles = [];
    let batchIndex = 0;
    let candlesBuilt = 0;

    // Build and stream candles in batches
    for (let time = startTime; time <= endTime; time += intervalSeconds * BATCH_SIZE) {
      const batchCandles = [];
      const batchEndTime = Math.min(time + (intervalSeconds * BATCH_SIZE), endTime);

      // Build batch
      for (let t = time; t <= batchEndTime; t += intervalSeconds) {
        let candle;
        if (swapCandles[t]) {
          candle = swapCandles[t];
        } else if (allCandles.length > 0) {
          // Fill with last close price
          const lastCandle = allCandles[allCandles.length - 1];
          candle = {
            open: lastCandle.close,
            high: lastCandle.close,
            low: lastCandle.close,
            close: lastCandle.close,
            volume: 0
          };
        } else {
          continue; // Skip until we have first price
        }

        const candleData = {
          time: t,
          ...candle
        };

        allCandles.push(candleData);
        batchCandles.push(candleData);
        candlesBuilt++;
      }

      // Save batch to database (transaction for performance)
      saveCandleBatch(tokenAddress, timeframe, batchCandles);

      // Stream batch to all connected clients via WebSocket
      const progress = {
        current: candlesBuilt,
        total: totalCandles,
        percent: Math.floor((candlesBuilt / totalCandles) * 100)
      };

      broadcastCandleBatch(buildJob, tokenAddress, timeframe, {
        index: batchIndex,
        candles: batchCandles,
        progress: progress
      });

      console.log(`   ✓ Batch ${batchIndex}: ${batchCandles.length} candles (${progress.percent}% complete)`);

      batchIndex++;

      // Small delay to avoid blocking event loop
      await new Promise(resolve => setImmediate(resolve));
    }

    // Send completion message
    broadcastBuildComplete(buildJob, tokenAddress, timeframe, totalCandles);

    console.log(`   ✅ Build complete: ${totalCandles} candles in ${batchIndex} batches`);

  } catch (error) {
    console.error(`   ❌ Build failed:`, error);
    broadcastBuildError(buildJob, tokenAddress, timeframe, error.message);
  }
}

function broadcastCandleBatch(buildJob, tokenAddress, timeframe, batch) {
  const message = JSON.stringify({
    type: 'candles:batch',
    buildJob,
    tokenAddress,
    timeframe,
    batch
  });

  // Broadcast to all WebSocket clients
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function broadcastBuildComplete(buildJob, tokenAddress, timeframe, totalCandles) {
  const message = JSON.stringify({
    type: 'candles:complete',
    buildJob,
    tokenAddress,
    timeframe,
    totalCandles
  });

  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}
```

## Frontend Implementation

### Updated ChartSection Component

```typescript
const [candles, setCandles] = useState<Candle[]>([]);
const [buildStatus, setBuildStatus] = useState<'complete' | 'building' | 'error'>('complete');
const [buildProgress, setBuildProgress] = useState<number>(0);

// Load initial chart data
useEffect(() => {
  if (!tokenAddress) return;

  const loadChartData = async () => {
    setLoading(true);

    const response = await fetchChartData(tokenAddress, timeframe);

    if (response.status === 'complete') {
      // Cached candles - load immediately
      setCandles(response.candles);
      setTransactions(response.transactions);
      setBuildStatus('complete');
      setLoading(false);
    } else if (response.status === 'building') {
      // Progressive build - show transactions, subscribe for candle updates
      setCandles([]);
      setTransactions(response.transactions);
      setBuildStatus('building');
      setBuildProgress(0);
      setLoading(false);

      // Subscribe to WebSocket for candle batches
      currentBuildJob.current = response.buildJob;
      console.log(`📊 Subscribed to progressive build: ${response.buildJob}`);
    } else {
      // No data
      setCandles([]);
      setTransactions([]);
      setBuildStatus('complete');
      setLoading(false);
    }
  };

  loadChartData();
}, [tokenAddress, timeframe]);

// Handle WebSocket messages for progressive candle loading
useEffect(() => {
  if (!wsRef.current) return;

  const handleCandleMessage = (message: any) => {
    if (message.type === 'candles:batch') {
      // Only process if it's for our current build job
      if (message.buildJob === currentBuildJob.current) {
        console.log(`📊 Received batch ${message.batch.index}: ${message.batch.candles.length} candles`);

        // Append new candles to existing ones
        setCandles(prev => {
          const combined = [...prev, ...message.batch.candles];
          // Sort by time to ensure correct order
          return combined.sort((a, b) => a.time - b.time);
        });

        // Update progress bar
        setBuildProgress(message.batch.progress.percent);
      }
    } else if (message.type === 'candles:complete') {
      if (message.buildJob === currentBuildJob.current) {
        console.log(`✅ Build complete: ${message.totalCandles} candles`);
        setBuildStatus('complete');
        setBuildProgress(100);
        currentBuildJob.current = null;
      }
    } else if (message.type === 'candles:error') {
      if (message.buildJob === currentBuildJob.current) {
        console.error(`❌ Build error: ${message.error}`);
        setBuildStatus('error');
        currentBuildJob.current = null;
      }
    }
  };

  // Add listener for candle messages
  wsRef.current.onCandleMessage = handleCandleMessage;

  return () => {
    if (wsRef.current) {
      wsRef.current.onCandleMessage = null;
    }
  };
}, []);

// Render with progress indicator
return (
  <div className="chart-container">
    {buildStatus === 'building' && (
      <div className="build-progress">
        <div className="progress-bar" style={{width: `${buildProgress}%`}}>
          Building chart... {buildProgress}%
        </div>
      </div>
    )}

    <TradingViewChart
      data={candles}
      height={chartHeight}
    />
  </div>
);
```

## Performance Comparison

### Before (Blocking)
```
User opens chart → 30 seconds → Chart appears
Time to first render: 30 seconds ❌
```

### After (Progressive)
```
User opens chart → 100ms → API response
                → 500ms → First 100 candles arrive → Chart starts rendering ✅
                → 1000ms → Next 100 candles → Chart updates
                → 1500ms → Next 100 candles → Chart updates
                → ...
                → 2500ms → Final batch → Chart complete

Time to first render: 500ms ✅
Time to full render: 2.5 seconds ✅
```

**Result**: 60x faster time-to-first-render!

## Benefits

1. ✅ **Instant Feedback**: Chart starts rendering in < 1 second
2. ✅ **Better UX**: User sees progress instead of blank screen
3. ✅ **Responsive**: Frontend stays interactive during build
4. ✅ **Scalable**: Can build millions of candles without blocking
5. ✅ **Fault Tolerant**: If build fails, user already has partial data
6. ✅ **Cache-aware**: Cached candles still load instantly

## Edge Cases

### What if user changes token while building?

```typescript
useEffect(() => {
  // Clear old build job when token changes
  currentBuildJob.current = null;
  setBuildStatus('complete');
  setBuildProgress(0);
}, [tokenAddress]);
```

### What if multiple users request same token?

```javascript
// Use token address + timeframe as build job ID
const buildJob = `${tokenAddress}-${timeframe}-${Date.now()}`;

// Or implement job deduplication:
const pendingBuilds = new Map();

if (pendingBuilds.has(`${tokenAddress}-${timeframe}`)) {
  // Return existing build job ID
  return res.json({
    status: 'building',
    buildJob: pendingBuilds.get(`${tokenAddress}-${timeframe}`),
    ...
  });
}
```

### What if WebSocket disconnects during build?

```typescript
// On reconnect, check if we have incomplete data
if (candles.length > 0 && buildStatus === 'building') {
  // Re-fetch to get cached candles (build probably finished)
  loadChartData();
}
```

## Implementation Checklist

- [ ] Add `buildJob` field to chart API response
- [ ] Implement `buildCandlesProgressively()` with batching
- [ ] Add WebSocket message types: `candles:batch`, `candles:complete`, `candles:error`
- [ ] Update frontend to handle progressive updates
- [ ] Add progress indicator UI component
- [ ] Test with large datasets (10,000+ candles)
- [ ] Add build job deduplication
- [ ] Handle WebSocket reconnection during builds
- [ ] Add metrics for build performance

## Next Enhancement: Persistent Build Jobs

Store build jobs in Redis so they survive server restarts:

```javascript
// When build starts
await redis.set(`build:${buildJob}`, JSON.stringify({
  tokenAddress,
  timeframe,
  status: 'building',
  progress: 0,
  startTime: Date.now()
}), 'EX', 300); // Expire after 5 minutes

// When user reconnects
const buildInfo = await redis.get(`build:${buildJob}`);
if (buildInfo && buildInfo.status === 'building') {
  // Resume or restart build
}
```

This ensures users get updates even if they refresh during a build!
