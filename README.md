# Shchard

A modern, real-time charting platform for OPN Chain, similar to DexTools. Built with Next.js, TypeScript, and TradingView Lightweight Charts.

## Features

- Real-time price charts with candlestick and line views
- Multiple timeframes (5M, 15M, 1H, 4H, 1D, 1W)
- Token information display (price, market cap, volume, liquidity, holders)
- Recent transactions list
- Trending tokens sidebar
- Token search functionality
- Responsive dark theme UI
- Web3 integration with OPN Chain

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Charts**: TradingView Lightweight Charts
- **Blockchain**: ethers.js v6
- **Data Fetching**: SWR
- **Date Handling**: date-fns

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Access to OPN Chain RPC endpoint

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Shchard
```

2. Install dependencies:
```bash
npm install
# or
yarn install
# or
pnpm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your OPN Chain RPC URL and DEX contract addresses.

4. Run the development server:
```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Configuration

Update the following in `.env`:

- `NEXT_PUBLIC_OPN_RPC_URL`: Your OPN Chain RPC endpoint
- `NEXT_PUBLIC_DEX_FACTORY`: DEX factory contract address
- `NEXT_PUBLIC_DEX_ROUTER`: DEX router contract address
- `NEXT_PUBLIC_WOPN`: Wrapped OPN token address

## Project Structure

```
Shchard/
├── app/                    # Next.js app directory
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   ├── Header.tsx         # Top navigation and search
│   ├── Sidebar.tsx        # Trending tokens sidebar
│   ├── ChartSection.tsx   # Price chart component
│   ├── TokenInfo.tsx      # Token information panel
│   └── TransactionList.tsx # Recent transactions
├── lib/                   # Utilities and services
│   ├── config.ts          # Chain and DEX configuration
│   ├── types.ts           # TypeScript interfaces
│   ├── web3.ts            # Web3 utilities and ABIs
│   ├── tokenService.ts    # Token data fetching
│   └── chartService.ts    # Chart data generation
└── public/                # Static assets
```

## Features to Implement

The platform currently uses sample data. To connect to real OPN Chain data:

1. **Update RPC Configuration**: Add the actual OPN Chain RPC URL
2. **Add DEX Contracts**: Configure the DEX factory and router addresses
3. **Implement Data Fetching**:
   - Fetch real token data from blockchain
   - Query DEX pairs and reserves
   - Listen to swap events for transactions
   - Calculate price from reserves
4. **Add Price History**: Store and fetch historical price data
5. **Implement WebSocket Updates**: Real-time price and transaction updates
6. **Add More Features**:
   - Wallet connection
   - Trading interface
   - Portfolio tracking
   - Price alerts
   - Social features

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT