module.exports = {
  apps: [
    {
      name: 'shchard-indexer',
      script: './indexer-worker.js',
      instances: 1, // ONLY 1 indexer (blockchain events are sequential)
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        OPN_RPC: process.env.OPN_RPC || 'https://testnet-rpc.iopn.tech',
        OPN_WS: process.env.OPN_WS || 'wss://testnet-rpc.iopn.tech/ws',
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379'
      },
      error_file: './logs/indexer-error.log',
      out_file: './logs/indexer-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    },
    {
      name: 'shchard-api',
      script: './server-api.js',
      instances: 2, // Multiple API workers (stateless, can scale)
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379'
      },
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
