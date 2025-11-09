# Shchard Backend - Production Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                  PRODUCTION ARCHITECTURE                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐          ┌──────────────┐                │
│  │   Indexer    │          │  API Server  │                │
│  │   Worker     │──Redis──▶│  (Cluster)   │                │
│  │   (1 proc)   │  Pub/Sub │  (2+ workers)│                │
│  └──────┬───────┘          └──────┬───────┘                │
│         │                          │                         │
│         │                          │                         │
│         ▼                          ▼                         │
│  ┌─────────────────────────────────────┐                   │
│  │      SQLite Database (WAL mode)      │                   │
│  │      Handles 100k+ writes/day        │                   │
│  └─────────────────────────────────────┘                   │
│                                                               │
│  PM2 Process Manager                                         │
│  - Auto-restart on crash                                     │
│  - Zero-downtime reload                                      │
│  - CPU/Memory monitoring                                     │
│  - Log rotation                                              │
└─────────────────────────────────────────────────────────────┘
```

## Why This Architecture?

### Single Indexer Worker
- **Blockchain events are sequential** - no benefit from multiple indexers
- **Avoids duplicate processing** - only one worker reads blockchain
- **Efficient resource usage** - indexer uses most CPU during catch-up
- **Handles 100k+ swaps/day easily** with optimized batch processing

### Multiple API Workers
- **Stateless** - API requests can be handled by any worker
- **Horizontal scaling** - add more workers as traffic grows
- **Load balancing** - PM2 automatically distributes requests
- **Zero-downtime deploys** - reload workers one at a time

### Redis Pub/Sub
- **Inter-process communication** - indexer publishes, API workers subscribe
- **Real-time events** - swaps broadcast to all WebSocket clients
- **Decoupled architecture** - workers don't need direct communication
- **Can scale to multiple servers** if needed later

### SQLite with WAL Mode
- **Handles 100k writes/day** - perfect for this use case
- **Concurrent reads** - multiple API workers can read simultaneously
- **Single writer (indexer)** - no write conflicts
- **Simple deployment** - no separate database server needed
- **Blazing fast** - local filesystem, no network latency

## Prerequisites

### Required
- Node.js 18+ (you have this)
- Redis server (install below)
- PM2 process manager (install below)

### Install Redis

**macOS:**
```bash
brew install redis
brew services start redis
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

**Docker (easiest):**
```bash
docker run -d --name redis -p 6379:6379 redis:alpine
```

### Install Dependencies

```bash
cd backend
npm install
```

This installs:
- `redis` - Redis client for Node.js
- `pm2` - Production process manager

## Production Setup

### 1. Create logs directory
```bash
mkdir -p logs
```

### 2. Configure environment variables
```bash
cp .env.example .env
# Edit .env with your RPC endpoints
```

Example `.env`:
```env
OPN_RPC=https://testnet-rpc.iopn.tech
OPN_WS=wss://testnet-rpc.iopn.tech/ws
REDIS_URL=redis://localhost:6379
PORT=3001
```

### 3. Start Redis (if not already running)
```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# If not running, start it
brew services start redis  # macOS
# OR
sudo systemctl start redis  # Linux
```

### 4. Start production workers
```bash
npm run prod:start
```

This starts:
- **1 indexer worker** - reads blockchain, writes to DB, publishes swaps to Redis
- **2 API workers** - serve HTTP/WebSocket, subscribe to Redis for real-time events

### 5. Check status
```bash
npm run prod:status
```

Output:
```
┌────┬──────────────────┬─────────┬─────────┬─────────┬──────────┐
│ id │ name             │ mode    │ ↺       │ status  │ cpu      │
├────┼──────────────────┼─────────┼─────────┼─────────┼──────────┤
│ 0  │ shchard-indexer  │ fork    │ 0       │ online  │ 12%      │
│ 1  │ shchard-api      │ cluster │ 0       │ online  │ 3%       │
│ 2  │ shchard-api      │ cluster │ 0       │ online  │ 2%       │
└────┴──────────────────┴─────────┴─────────┴─────────┴──────────┘
```

### 6. Monitor logs (real-time)
```bash
npm run prod:logs
```

To follow specific worker:
```bash
pm2 logs shchard-indexer  # Indexer only
pm2 logs shchard-api      # API workers only
```

### 7. Monitor resources
```bash
npm run prod:monit
```

Shows real-time CPU, memory, network usage for each worker.

## Production Commands

### Start workers
```bash
npm run prod:start
```

### Stop all workers
```bash
npm run prod:stop
```

### Restart all workers (with downtime)
```bash
npm run prod:restart
```

### Reload API workers (zero downtime)
```bash
npm run prod:reload
```

### Delete all workers
```bash
npm run prod:delete
```

### View logs
```bash
npm run prod:logs      # All workers
pm2 logs shchard-indexer  # Indexer only
pm2 logs shchard-api      # API only
pm2 logs --lines 100      # Last 100 lines
```

### View detailed metrics
```bash
pm2 monit              # Interactive monitor
pm2 status             # Simple status table
pm2 describe shchard-indexer  # Detailed info about indexer
```

## Scaling

### Add more API workers
Edit `ecosystem.config.js`:
```javascript
{
  name: 'shchard-api',
  instances: 4,  // Change from 2 to 4
  ...
}
```

Then reload:
```bash
npm run prod:reload
```

### Auto-scale based on CPU
```javascript
{
  name: 'shchard-api',
  instances: 'max',  // Use all CPU cores
  ...
}
```

### Never scale the indexer
The indexer should always be `instances: 1` because:
- Blockchain events are sequential
- Multiple indexers would duplicate work
- Single indexer is fast enough for millions of swaps/day

## Performance Tuning

### Database Optimization
SQLite with WAL mode is already optimized, but you can tweak:

**Increase cache size** (in `database.js`):
```javascript
db.pragma('cache_size = -64000');  // 64MB cache
```

**Adjust synchronous mode** (for more writes):
```javascript
db.pragma('synchronous = NORMAL');  // Less safe but faster
```

### Redis Optimization
**Increase max memory**:
```bash
redis-cli CONFIG SET maxmemory 256mb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### PM2 Optimization
**Increase max memory before restart**:
```javascript
{
  max_memory_restart: '1G',  // Restart if worker uses >1GB
}
```

## Monitoring & Alerts

### PM2 Plus (Optional - Free Tier)
```bash
pm2 link <secret> <public>  # Get keys from pm2.io
```

Features:
- Real-time monitoring
- Email/Slack alerts
- Exception tracking
- Deployment tracking

### Log Rotation
PM2 has built-in log rotation:
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
```

## Troubleshooting

### Workers won't start
```bash
# Check logs
pm2 logs

# Common issues:
# 1. Redis not running
redis-cli ping

# 2. Port already in use
lsof -i :3001

# 3. Missing dependencies
npm install
```

### Redis connection errors
```bash
# Test Redis
redis-cli ping

# Check config
redis-cli CONFIG GET bind
redis-cli CONFIG GET protected-mode

# Make sure it's listening on localhost
redis-cli CONFIG SET bind "127.0.0.1"
```

### Indexer not catching up
```bash
# Check indexer logs
pm2 logs shchard-indexer

# Restart indexer
pm2 restart shchard-indexer

# Check RPC connection
curl https://testnet-rpc.iopn.tech
```

### Memory leaks
```bash
# Monitor memory
pm2 monit

# If worker keeps restarting due to memory:
# 1. Check for swap caching issues
# 2. Lower max_memory_restart
# 3. Clear cache periodically
```

## Deployment Checklist

- [ ] Redis installed and running
- [ ] `.env` file configured
- [ ] `logs/` directory created
- [ ] Dependencies installed (`npm install`)
- [ ] Redis connection tested (`redis-cli ping`)
- [ ] Workers started (`npm run prod:start`)
- [ ] Status checked (`npm run prod:status`)
- [ ] Logs monitored (`npm run prod:logs`)
- [ ] API responding (`curl http://localhost:3001/health`)
- [ ] WebSocket working (frontend connects)

## Cost Estimation (100k swaps/day)

### Server Requirements
- **CPU**: 2-4 cores (indexer uses 1, API uses 1-2)
- **RAM**: 2-4 GB (indexer: 500MB, API workers: 300MB each, Redis: 256MB)
- **Disk**: 10-20 GB (database grows ~50MB/day with 100k swaps)

### Monthly Costs
- **AWS t3.medium** ($30/mo): Perfect fit
- **DigitalOcean $12/mo droplet**: Works for testnet
- **Linode 4GB** ($24/mo): Good performance
- **VPS $10-30/mo**: Most providers work fine

### RPC Costs
- **Public RPC**: Free (but rate limited)
- **Dedicated RPC**: $50-200/mo (recommended for 100k+ swaps/day)

## Upgrading

### Zero-Downtime Deployment
```bash
# 1. Git pull latest code
git pull

# 2. Install dependencies
npm install

# 3. Reload API workers (keeps indexer running)
pm2 reload shchard-api

# 4. If indexer changes needed, restart it
pm2 restart shchard-indexer
```

### Database Migrations
SQLite auto-creates tables. For schema changes:
```bash
# Stop workers
npm run prod:stop

# Backup database
cp shchard.db shchard.db.backup

# Run migration script
node migrate.js

# Restart workers
npm run prod:start
```

## Support

Check logs first:
```bash
pm2 logs --lines 200
```

Common log locations:
- Indexer: `logs/indexer-error.log`, `logs/indexer-out.log`
- API: `logs/api-error.log`, `logs/api-out.log`
- PM2: `~/.pm2/logs/`
