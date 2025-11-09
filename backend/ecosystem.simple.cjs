// PM2 configuration for current single-server setup
module.exports = {
  apps: [
    {
      name: 'shchard',
      script: './server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        OPN_RPC: process.env.OPN_RPC || 'https://testnet-rpc.iopn.tech',
        OPN_WS: process.env.OPN_WS || 'wss://testnet-rpc.iopn.tech/ws'
      },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true
    }
  ]
};
