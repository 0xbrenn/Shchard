import { ethers } from "ethers";
import { OPN_CHAIN_CONFIG } from "./config";
import { PAIR_ABI } from "./web3";

export interface SwapEvent {
  tokenAddress: string;
  pairAddress: string;
  price: number;
  amount: string;
  type: "buy" | "sell";
  timestamp: number;
  txHash: string;
  blockNumber: number;
}

type SwapCallback = (swap: SwapEvent) => void;

export class WebSocketService {
  private provider: ethers.WebSocketProvider | null = null;
  private listeners: Map<string, SwapCallback[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private isConnecting = false;

  async connect() {
    if (this.provider || this.isConnecting) return;

    this.isConnecting = true;
    try {
      console.log("Connecting to WebSocket:", "wss://testnet-rpc.iopn.tech/ws");

      this.provider = new ethers.WebSocketProvider("wss://testnet-rpc.iopn.tech/ws");

      // Test connection
      await this.provider.getNetwork();
      console.log("WebSocket connected successfully");

      this.reconnectAttempts = 0;
      this.isConnecting = false;

      // Handle disconnection
      this.provider.websocket.on("close", () => {
        console.log("WebSocket disconnected");
        this.handleDisconnect();
      });

      this.provider.websocket.on("error", (error) => {
        console.error("WebSocket error:", error);
      });

    } catch (error) {
      console.error("Failed to connect to WebSocket:", error);
      this.isConnecting = false;
      this.handleDisconnect();
    }
  }

  private async handleDisconnect() {
    this.provider = null;

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Reconnecting... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

      setTimeout(() => {
        this.connect();
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      console.error("Max reconnection attempts reached");
    }
  }

  async subscribeToSwaps(
    tokenAddress: string,
    pairAddress: string,
    isToken0: boolean,
    callback: SwapCallback
  ) {
    if (!this.provider) {
      await this.connect();
      if (!this.provider) {
        console.error("Cannot subscribe: WebSocket not connected");
        return;
      }
    }

    const key = `${pairAddress.toLowerCase()}-${tokenAddress.toLowerCase()}`;

    // Add callback to listeners
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key)!.push(callback);

    // Create contract instance
    const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);

    console.log(`Subscribing to swaps on pair ${pairAddress}`);

    // Listen for Swap events
    const swapFilter = pairContract.filters.Swap();

    pairContract.on(swapFilter, async (
      sender: string,
      amount0In: bigint,
      amount1In: bigint,
      amount0Out: bigint,
      amount1Out: bigint,
      to: string,
      event: any
    ) => {
      try {
        console.log("🔥 New swap detected!", {
          amount0In: amount0In.toString(),
          amount1In: amount1In.toString(),
          amount0Out: amount0Out.toString(),
          amount1Out: amount1Out.toString(),
        });

        const isBuy = isToken0 ? amount0Out > 0n : amount1Out > 0n;
        const tokenAmount = isToken0
          ? (isBuy ? amount0Out : amount0In)
          : (isBuy ? amount1Out : amount1In);
        const wopnAmount = isToken0
          ? (isBuy ? amount1In : amount1Out)
          : (isBuy ? amount0In : amount0Out);

        const tokenAmountNum = Number(tokenAmount) / 1e18;
        const wopnAmountNum = Number(wopnAmount) / 1e18;

        if (tokenAmountNum === 0) return;

        const priceInWOPN = wopnAmountNum / tokenAmountNum;
        const priceInUSD = priceInWOPN * OPN_CHAIN_CONFIG.opnPriceUSD;

        const swapEvent: SwapEvent = {
          tokenAddress,
          pairAddress,
          price: priceInUSD,
          amount: tokenAmountNum.toFixed(4),
          type: isBuy ? "buy" : "sell",
          timestamp: Date.now() / 1000,
          txHash: event.log.transactionHash,
          blockNumber: event.log.blockNumber,
        };

        // Notify all callbacks
        const callbacks = this.listeners.get(key) || [];
        callbacks.forEach(cb => cb(swapEvent));

      } catch (error) {
        console.error("Error processing swap event:", error);
      }
    });

    console.log(`✅ Subscribed to ${key}`);
  }

  unsubscribe(tokenAddress: string, pairAddress: string) {
    const key = `${pairAddress.toLowerCase()}-${tokenAddress.toLowerCase()}`;
    this.listeners.delete(key);
    console.log(`Unsubscribed from ${key}`);
  }

  disconnect() {
    if (this.provider) {
      this.provider.destroy();
      this.provider = null;
      console.log("WebSocket disconnected");
    }
    this.listeners.clear();
  }
}

// Singleton instance
let wsService: WebSocketService | null = null;

export function getWebSocketService(): WebSocketService {
  if (!wsService) {
    wsService = new WebSocketService();
  }
  return wsService;
}
