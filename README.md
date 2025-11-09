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

## Testing the Platform

To test with real OPN Chain testnet data:

1. The platform is pre-configured for OPN Testnet
2. Copy the WOPN address from the sidebar: `0xBc022C9dEb5AF250A526321d16Ef52E39b4DBD84`
3. Paste it into the search bar and press Search
4. You'll see:
   - Real-time price calculated from DEX reserves
   - Actual liquidity in the pool
   - Recent swap transactions from the blockchain
   - Live trading pair information

You can also search for any other token address that has a trading pair with WOPN on OPN testnet.

## Configuration

Update the following in `.env`:

- `NEXT_PUBLIC_OPN_RPC_URL`: OPN Chain testnet RPC (default: https://testnet-rpc.iopn.tech)
- `NEXT_PUBLIC_FACTORY_ADDRESS`: DEX factory contract address (default: 0x8860242B65611dfd077aEe26C3C7920813dF9208)
- `NEXT_PUBLIC_ROUTER_ADDRESS`: DEX router contract address (default: 0xB489bce5c9c9364da2D1D1Bc5CE4274F63141885)
- `NEXT_PUBLIC_WOPN_ADDRESS`: Wrapped OPN token address (default: 0xBc022C9dEb5AF250A526321d16Ef52E39b4DBD84)

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

## Current Features (LIVE)

The platform now includes fully functional blockchain integration:

✅ **Real Token Data**: Fetches token info directly from OPN Chain
✅ **Live Price Calculation**: Calculates prices from actual DEX reserve ratios
✅ **Real Liquidity Data**: Shows actual liquidity locked in trading pairs
✅ **Blockchain Transactions**: Displays real swap transactions from the chain
✅ **Pair Detection**: Automatically finds trading pairs with WOPN
✅ **Explorer Integration**: Links to OPN testnet explorer for transactions

## Features to Add

Future enhancements to make the platform even better:

1. **Price History & Charts**: Store historical price data for accurate charts
2. **WebSocket Updates**: Real-time price and transaction updates
3. **Wallet Connection**: Connect MetaMask/WalletConnect for trading
4. **Trading Interface**: Direct swap functionality
5. **Multi-Pair Support**: Support for non-WOPN pairs
6. **Token Search**: Search by name/symbol, not just address
7. **Portfolio Tracking**: Track user holdings and P&L
8. **Price Alerts**: Notifications for price movements
9. **Advanced Analytics**: Volume charts, holder analytics, etc.

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT