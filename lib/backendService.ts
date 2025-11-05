const API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';
const WS_URL = process.env.NEXT_PUBLIC_BACKEND_WS || 'ws://localhost:3001';

export interface BackendCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BackendTransaction {
  timestamp: number;
  price: number;
  volume: number;
  blockNumber: number;
  txHash: string;
  type: 'buy' | 'sell';
  tokenAmount: number;
  wopnAmount: number;
}

export interface ChartDataResponse {
  candles: BackendCandle[];
  transactions: BackendTransaction[];
}

export interface TokenInfoResponse {
  price: number;
  volume24h: number;
  lastUpdate: number;
}

export interface SwapUpdate {
  type: 'swap';
  tokenAddress: string;
  data: BackendTransaction;
}

/**
 * Fetch chart data from backend
 */
export async function fetchChartData(
  tokenAddress: string,
  timeframe: string = '1H'
): Promise<ChartDataResponse> {
  try {
    const response = await fetch(
      `${API_URL}/api/chart/${tokenAddress}?timeframe=${timeframe}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching chart data:', error);
    return { candles: [], transactions: [] };
  }
}

/**
 * Fetch token info from backend
 */
export async function fetchTokenInfo(
  tokenAddress: string
): Promise<TokenInfoResponse> {
  try {
    const response = await fetch(`${API_URL}/api/token/${tokenAddress}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching token info:', error);
    return { price: 0, volume24h: 0, lastUpdate: 0 };
  }
}

/**
 * Trigger backend to index a new token
 */
export async function indexToken(tokenAddress: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/api/index/${tokenAddress}`, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    return result.success;
  } catch (error) {
    console.error('Error indexing token:', error);
    return false;
  }
}

/**
 * WebSocket connection for real-time updates
 */
export class BackendWebSocket {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private subscribers: Map<string, (data: SwapUpdate) => void> = new Map();

  constructor() {
    this.connect();
  }

  private connect() {
    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('✅ Connected to backend WebSocket');
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const data: SwapUpdate = JSON.parse(event.data);

          if (data.type === 'swap') {
            // Notify all subscribers for this token
            const callback = this.subscribers.get(data.tokenAddress.toLowerCase());
            if (callback) {
              callback(data);
            }
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('❌ Backend WebSocket disconnected, reconnecting...');
        this.reconnect();
      };
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      this.reconnect();
    }
  }

  private reconnect() {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      console.log('🔄 Reconnecting to backend WebSocket...');
      this.connect();
    }, 3000);
  }

  /**
   * Subscribe to real-time updates for a token
   */
  subscribe(tokenAddress: string, callback: (data: SwapUpdate) => void) {
    const address = tokenAddress.toLowerCase();
    this.subscribers.set(address, callback);

    // Send subscribe message to backend
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        tokenAddress: address
      }));
    }
  }

  /**
   * Unsubscribe from token updates
   */
  unsubscribe(tokenAddress: string) {
    this.subscribers.delete(tokenAddress.toLowerCase());
  }

  /**
   * Close connection
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscribers.clear();
  }
}
