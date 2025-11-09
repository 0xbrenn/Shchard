# Multi-Worker Architecture for Production DEX Indexer

## Overview

Separation of concerns with specialized workers for different indexing tasks:
- **Real-time workers**: Process new swaps as they happen (WebSocket)
- **Historical workers**: Backfill gaps and rebuild candles (REST API)
- **API workers**: Serve chart data and WebSocket subscriptions

## Architecture Diagram

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Real-Time      │     │  Historical      │     │  Candle         │
│  Indexer        │     │  Backfill        │     │  Builder        │
│  (WebSocket)    │     │  (REST)          │     │  (Cron)         │
│                 │     │                  │     │                 │
│  • New blocks   │     │  • Gap filling   │     │  • Rebuild 1M   │
│  • Live swaps   │     │  • Missed txns   │     │  • Rebuild 5M   │
│  • PairCreated  │     │  • Token backlog │     │  • Rebuild 1H   │
│                 │     │                  │     │  • Rebuild 1D   │
│  1 instance     │     │  2+ instances    │     │  1 instance     │
└────────┬────────┘     └────────┬─────────┘     └────────┬────────┘
         │                       │                        │
         │                       │                        │
         └───────────────────────┴────────────────────────┘
                                 │
                          ┌──────▼──────┐
                          │   Redis     │
                          │  Pub/Sub    │
                          └──────┬──────┘
                                 │
                ┌────────────────┼────────────────┐
                │                │                │
         ┌──────▼──────┐  ┌──────▼──────┐ ┌──────▼──────┐
         │  API        │  │  API        │ │  API        │
         │  Worker 1   │  │  Worker 2   │ │  Worker N   │
         │             │  │             │ │             │
         │  HTTP/WS    │  │  HTTP/WS    │ │  HTTP/WS    │
         └──────┬──────┘  └──────┬──────┘ └──────┬──────┘
                │                │                │
                └────────────────┴────────────────┘
                                 │
                          ┌──────▼──────┐
                          │   SQLite    │
                          │  (WAL mode) │
                          └─────────────┘
```

## Worker Types

### 1. Real-Time Indexer Worker (`realtime-worker.js`)

**Responsibility**: Process blockchain events as they happen

**Tasks**:
- Listen to WebSocket for new blocks
- Process PairCreated events
- Process Swap events in real-time
- Publish to Redis for API workers
- Track indexer state (last processed block)

**Characteristics**:
- **Count**: Exactly 1 instance (blockchain events are sequential)
- **Priority**: Low latency, high reliability
- **Data source**: WebSocket RPC
- **Restart policy**: Auto-restart on failure

**Example**:
```javascript
// Processes block 1000000 → 1000001 → 1000002 in sequence
// Each swap is published to Redis immediately
```

### 2. Historical Backfill Worker (`historical-worker.js`)

**Responsibility**: Fill gaps and catch up on missed data

**Tasks**:
- Scan for gaps in block coverage
- Backfill missing swaps for existing tokens
- Index newly discovered tokens
- Verify data integrity
- Retry failed blocks

**Characteristics**:
- **Count**: 1-4 instances (can run in parallel)
- **Priority**: Throughput, completeness
- **Data source**: REST RPC (batched requests)
- **Coordination**: Use Redis locks to avoid duplicate work

**Example**:
```javascript
// Worker 1: Backfills blocks 900000-925000 for Token A
// Worker 2: Backfills blocks 925001-950000 for Token B
// Worker 3: Scans for gaps and fills blocks 876543-876600
```

### 3. Candle Builder Worker (`candle-worker.js`)

**Responsibility**: Rebuild and maintain pre-calculated candles

**Tasks**:
- Rebuild stale candles (older than 5 minutes)
- Build candles for new timeframes
- Delete old candles (beyond 7 days)
- Optimize candle storage

**Characteristics**:
- **Count**: 1 instance
- **Schedule**: Every 1-5 minutes (cron)
- **Priority**: Data freshness, storage efficiency
- **Data source**: SQLite database

**Example**:
```javascript
// Every 1 minute:
// - Rebuild 1M candles for tokens with new swaps
// - Rebuild 5M/15M candles every 5 minutes
// - Rebuild 1H/4H candles every 15 minutes
```

### 4. API Workers (`server-api.js`)

**Responsibility**: Serve HTTP and WebSocket requests

**Tasks**:
- HTTP endpoints for chart data
- WebSocket subscriptions for live updates
- Subscribe to Redis for real-time events
- Read-only database access

**Characteristics**:
- **Count**: 2+ instances (horizontally scalable)
- **Load balancing**: Nginx or PM2 cluster mode
- **State**: Stateless (can add/remove anytime)

## Data Flow Examples

### Example 1: New Swap on Existing Token

```
1. Block 1000000 mined with 1 swap for Token A
   ↓
2. Real-Time Worker detects swap via WebSocket
   ↓
3. Real-Time Worker saves to SQLite:
   - INSERT INTO swaps (...)
   ↓
4. Real-Time Worker publishes to Redis:
   - PUBLISH swaps:new {"type": "swap", "tokenAddress": "0xabc...", "data": {...}}
   ↓
5. All API Workers receive Redis message
   ↓
6. API Workers broadcast to subscribed WebSocket clients
   ↓
7. Frontend receives live swap update
```

### Example 2: New Token Launch

```
1. PairCreated event emitted for Token B
   ↓
2. Real-Time Worker detects event
   ↓
3. Real-Time Worker saves to SQLite:
   - INSERT INTO tokens (address, name, symbol, decimals, pair_address)
   - INSERT INTO pairs (...)
   ↓
4. Real-Time Worker publishes to Redis:
   - PUBLISH tokens:new {"type": "token", "tokenAddress": "0xdef...", "data": {...}}
   ↓
5. Historical Worker picks up new token
   ↓
6. Historical Worker scans for missed swaps (if token existed before PairCreated)
   ↓
7. First swap arrives → Real-Time Worker processes it
   ↓
8. Candle Builder detects new token with swaps
   ↓
9. Candle Builder creates initial candles for all timeframes
```

### Example 3: Gap Detected (Missed Block)

```
1. Real-Time Worker processes blocks: 1000000 → 1000001 → 1000003
   (Block 1000002 was missed due to WebSocket disconnect)
   ↓
2. Real-Time Worker detects gap: last_block + 1 ≠ current_block
   ↓
3. Real-Time Worker publishes to Redis:
   - PUBLISH gaps:detected {"start": 1000002, "end": 1000002}
   ↓
4. Historical Worker receives gap notification
   ↓
5. Historical Worker backfills block 1000002 via REST API
   ↓
6. Historical Worker processes any swaps found
   ↓
7. Historical Worker saves to database
   ↓
8. Candle Builder rebuilds affected candles
```

### Example 4: Page Refresh with Historical Data

```
1. User opens chart for Token A
   ↓
2. Frontend calls GET /api/chart/0xabc...?timeframe=1H
   ↓
3. Nginx routes to API Worker 2 (load balanced)
   ↓
4. API Worker 2 queries SQLite:
   - SELECT * FROM candles WHERE token_address = ? AND timeframe = '1H'
   - SELECT * FROM swaps WHERE token_address = ? LIMIT 50
   ↓
5. API Worker 2 returns:
   - candles: [...] (1000 candles)
   - transactions: [...] (50 recent swaps, properly mapped to camelCase)
   - tokenMetadata: {name, symbol, decimals}
   ↓
6. Frontend displays chart and transaction list
   ↓
7. Frontend subscribes to WebSocket for live updates
   ↓
8. Future swaps are received in real-time
```

## Redis Pub/Sub Channels

### Channels

```javascript
// New swap detected
swaps:new
  Payload: {type: 'swap', tokenAddress: '0x...', data: {txHash, price, volume, ...}}

// New token detected
tokens:new
  Payload: {type: 'token', tokenAddress: '0x...', data: {name, symbol, decimals, ...}}

// Gap detected in block coverage
gaps:detected
  Payload: {start: 1000002, end: 1000010}

// Candles rebuilt
candles:updated
  Payload: {tokenAddress: '0x...', timeframes: ['1M', '5M', '1H']}

// Indexer health status
health:realtime
  Payload: {status: 'healthy', lastBlock: 1000000, timestamp: 1699999999}
```

## File Structure

```
backend/
├── workers/
│   ├── realtime-worker.js      # WebSocket-based real-time indexer
│   ├── historical-worker.js    # REST-based historical backfill
│   ├── candle-worker.js        # Periodic candle rebuilder
│   └── server-api.js           # HTTP/WebSocket API server
├── lib/
│   ├── indexer-realtime.js     # Real-time indexing logic
│   ├── indexer-historical.js   # Historical indexing logic
│   ├── candle-builder.js       # Candle building logic
│   └── redis-client.js         # Redis pub/sub client
├── ecosystem.config.js         # PM2 process configuration
├── docker-compose.yml          # Redis + PostgreSQL (optional)
└── database.js                 # SQLite wrapper
```

## PM2 Configuration

```javascript
module.exports = {
  apps: [
    // 1 Real-time indexer
    {
      name: 'shchard-realtime',
      script: './workers/realtime-worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        WORKER_TYPE: 'realtime',
        REDIS_URL: 'redis://localhost:6379'
      }
    },

    // 2 Historical backfill workers
    {
      name: 'shchard-historical',
      script: './workers/historical-worker.js',
      instances: 2,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        WORKER_TYPE: 'historical',
        REDIS_URL: 'redis://localhost:6379'
      }
    },

    // 1 Candle builder (cron-based)
    {
      name: 'shchard-candles',
      script: './workers/candle-worker.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      cron_restart: '*/1 * * * *', // Every 1 minute
      env: {
        WORKER_TYPE: 'candles',
        REDIS_URL: 'redis://localhost:6379'
      }
    },

    // 2+ API servers
    {
      name: 'shchard-api',
      script: './workers/server-api.js',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      max_memory_restart: '300M',
      env: {
        PORT: 3001,
        REDIS_URL: 'redis://localhost:6379'
      }
    }
  ]
};
```

## Performance Characteristics

### Real-Time Worker
- **Latency**: 100-500ms (block confirmation + processing)
- **Throughput**: 10-50 swaps/second
- **Memory**: ~200MB
- **CPU**: Low (event-driven)

### Historical Workers (2 instances)
- **Throughput**: 500-1000 blocks/minute per worker
- **Batch size**: 500 blocks per batch
- **Memory**: ~300MB per worker
- **CPU**: Medium (parallel processing)

### Candle Builder
- **Interval**: Every 1 minute
- **Rebuild time**: 100-500ms per token
- **Tokens/minute**: 100-300 tokens
- **Memory**: ~200MB

### API Workers (2 instances)
- **Requests/second**: 100-500 per worker
- **Response time**: 10-50ms (cached candles)
- **Memory**: ~150MB per worker

## Scaling Strategy

### For 100k swaps/day (~70 swaps/minute)
```
1 Real-time worker   ✓
2 Historical workers ✓
1 Candle builder     ✓
2 API workers        ✓

Total: 6 processes
Cost: $20-30/mo VPS (4 vCPU, 8GB RAM)
```

### For 1M swaps/day (~700 swaps/minute)
```
1 Real-time worker   ✓
4 Historical workers ✓
2 Candle builders    ✓ (partition by token)
4 API workers        ✓

Total: 11 processes
Cost: $50-80/mo VPS (8 vCPU, 16GB RAM)
```

### For 10M swaps/day (~7000 swaps/minute)
```
2 Real-time workers  ✓ (partition by pair)
8 Historical workers ✓
4 Candle builders    ✓
8 API workers        ✓

Total: 22 processes
Cost: $150-200/mo dedicated (16 vCPU, 32GB RAM)
+ Consider PostgreSQL instead of SQLite
```

## Advantages

1. **Fault Tolerance**: If real-time worker misses data, historical worker catches it
2. **Scalability**: Add more historical/API workers as load increases
3. **Performance**: Real-time stays responsive, heavy lifting happens in background
4. **Maintainability**: Each worker has single responsibility
5. **Monitoring**: Can track each worker's health independently
6. **Zero Downtime**: Can restart historical/API workers without affecting real-time

## Next Steps

1. Extract indexing logic from `indexer.js` into separate modules
2. Create `workers/` directory with specialized worker scripts
3. Implement Redis pub/sub for inter-worker communication
4. Update PM2 config with multi-worker setup
5. Add monitoring and health checks
6. Test gap detection and backfill scenarios
