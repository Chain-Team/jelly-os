import { Logger } from '../core/utils/Logger';

export interface FeedItem {
  id: string;
  source: string;
  title: string;
  content: string;
  url?: string;
  timestamp: number;
  category: 'news' | 'signal' | 'whale' | 'price' | 'social' | 'onchain' | 'prediction';
  metadata?: Record<string, any>;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
  priority?: 'high' | 'medium' | 'low';
}

export interface FeedSource {
  name: string;
  interval: number;
  enabled: boolean;
  fetch: () => Promise<FeedItem[]>;
}

export class FeedManager {
  private logger: Logger;
  private items: FeedItem[] = [];
  private sources: Map<string, FeedSource> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private listeners: Set<(item: FeedItem) => void> = new Set();
  private maxItems = 500;
  private running = false;

  constructor() {
    this.logger = new Logger('FeedManager');
    this.registerBuiltinSources();
  }

  private registerBuiltinSources(): void {
    // CoinGecko price feed
    this.register({
      name: 'coingecko_prices',
      interval: 60_000,
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch(
            'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,bnb&vs_currencies=usd&include_24hr_change=true',
            { signal: AbortSignal.timeout(8000) }
          );
          if (!res.ok) return [];
          const data = await res.json() as any;
          return Object.entries(data).map(([id, info]: [string, any]) => ({
            id: `price-${id}-${Date.now()}`,
            source: 'coingecko',
            title: `${id.toUpperCase()} Price Update`,
            content: `$${info.usd.toLocaleString()} (${info.usd_24h_change?.toFixed(2)}% 24h)`,
            timestamp: Date.now(),
            category: 'price' as const,
            metadata: { price: info.usd, change24h: info.usd_24h_change, asset: id },
            sentiment: (info.usd_24h_change ?? 0) > 0 ? 'bullish' : 'bearish',
          }));
        } catch { return []; }
      },
    });

    // Alternative.me Fear & Greed Index
    this.register({
      name: 'fear_greed',
      interval: 3_600_000, // hourly
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch('https://api.alternative.me/fng/?limit=1', { signal: AbortSignal.timeout(5000) });
          if (!res.ok) return [];
          const data = await res.json() as any;
          const item = data?.data?.[0];
          if (!item) return [];
          const val = parseInt(item.value);
          return [{
            id: `fng-${Date.now()}`,
            source: 'alternative.me',
            title: `Fear & Greed Index: ${item.value_classification}`,
            content: `Score: ${item.value}/100 (${item.value_classification})`,
            timestamp: Date.now(),
            category: 'signal',
            metadata: { score: val, classification: item.value_classification },
            sentiment: val > 60 ? 'bullish' : val < 40 ? 'bearish' : 'neutral',
            priority: val < 25 || val > 75 ? 'high' : 'medium',
          }];
        } catch { return []; }
      },
    });

    // CryptoCompare News
    this.register({
      name: 'crypto_news',
      interval: 300_000, // 5 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch(
            'https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest&limit=5',
            { signal: AbortSignal.timeout(8000) }
          );
          if (!res.ok) return [];
          const data = await res.json() as any;
          return (data?.Data || []).slice(0, 5).map((item: any) => ({
            id: `news-${item.id}`,
            source: item.source || 'cryptocompare',
            title: item.title || '',
            content: (item.body || '').slice(0, 300),
            url: item.url,
            timestamp: (item.published_on || 0) * 1000,
            category: 'news' as const,
            metadata: { tags: item.tags, categories: item.categories },
            sentiment: 'neutral' as const,
          }));
        } catch { return []; }
      },
    });

    // Polymarket trending markets
    this.register({
      name: 'polymarket_trends',
      interval: 600_000, // 10 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch(
            'https://gamma-api.polymarket.com/markets?limit=5&order=volume&ascending=false&active=true',
            { signal: AbortSignal.timeout(8000) }
          );
          if (!res.ok) return [];
          const data = await res.json() as any;
          return (Array.isArray(data) ? data : []).slice(0, 5).map((mkt: any) => ({
            id: `poly-${mkt.id}`,
            source: 'polymarket',
            title: mkt.question || '',
            content: `Volume: $${(mkt.volume || 0).toLocaleString()} | Yes: ${(mkt.outcomePrices?.[0] * 100 || 0).toFixed(0)}%`,
            url: `https://polymarket.com/event/${mkt.slug}`,
            timestamp: Date.now(),
            category: 'prediction' as const,
            metadata: { volume: mkt.volume, yesPrice: mkt.outcomePrices?.[0] },
            sentiment: 'neutral' as const,
          }));
        } catch { return []; }
      },
    });

    // On-chain large transfers (simulated from mempool)
    this.register({
      name: 'whale_watch',
      interval: 120_000, // 2 min
      enabled: !!process.env.ALCHEMY_KEY,
      fetch: async () => {
        if (!process.env.ALCHEMY_KEY) return [];
        try {
          // Check recent large ETH transfers
          const res = await fetch(`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers',
              params: [{ category: ['external'], maxCount: '0x5', order: 'desc',
                withMetadata: true, excludeZeroValue: true,
                fromBlock: 'latest', toBlock: 'latest' }],
            }),
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) return [];
          const data = await res.json() as any;
          return (data?.result?.transfers || [])
            .filter((t: any) => parseFloat(t.value || '0') > 100)
            .slice(0, 3)
            .map((t: any) => ({
              id: `whale-${t.hash}`,
              source: 'alchemy-onchain',
              title: `Whale Transfer: ${parseFloat(t.value).toFixed(2)} ETH`,
              content: `From: ${t.from?.slice(0, 8)}... To: ${t.to?.slice(0, 8)}... — ${parseFloat(t.value).toFixed(4)} ETH`,
              url: `https://etherscan.io/tx/${t.hash}`,
              timestamp: Date.now(),
              category: 'whale' as const,
              metadata: { from: t.from, to: t.to, value: t.value, hash: t.hash },
              priority: parseFloat(t.value) > 1000 ? 'high' : 'medium',
            }));
        } catch { return []; }
      },
    });

    // DeFiLlama TVL summary
    this.register({
      name: 'defillama_tvl',
      interval: 1_800_000, // 30 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch('https://api.llama.fi/v2/chains', { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return [];
          const data = await res.json() as any;
          const top = (Array.isArray(data) ? data : [])
            .sort((a: any, b: any) => (b.tvl || 0) - (a.tvl || 0))
            .slice(0, 5);
          if (top.length === 0) return [];
          const summary = top.map((c: any) => `${c.name}: $${((c.tvl || 0) / 1e9).toFixed(2)}B`).join(' | ');
          return [{
            id: `tvl-${Date.now()}`,
            source: 'defillama',
            title: 'Top Chain TVL Update',
            content: summary,
            timestamp: Date.now(),
            category: 'onchain',
            metadata: { chains: top },
            sentiment: 'neutral',
          }];
        } catch { return []; }
      },
    });

    // Coinglass funding rates
    this.register({
      name: 'funding_rates',
      interval: 900_000, // 15 min
      enabled: true,
      fetch: async () => {
        try {
          const res = await fetch(
            'https://open-api.coinglass.com/public/v2/funding?symbol=BTC',
            { signal: AbortSignal.timeout(8000) }
          );
          if (!res.ok) return [];
          const data = await res.json() as any;
          if (!data?.data) return [];
          const rates = (Array.isArray(data.data) ? data.data : []).slice(0, 5);
          const summary = rates.map((r: any) => `${r.exchangeName}: ${(r.fundingRate * 100).toFixed(4)}%`).join(' | ');
          return [{
            id: `funding-${Date.now()}`,
            source: 'coinglass',
            title: 'BTC Funding Rates',
            content: summary || 'No funding data',
            timestamp: Date.now(),
            category: 'signal',
            metadata: { rates },
            sentiment: rates.some((r: any) => r.fundingRate > 0.0005) ? 'bearish' : 'neutral',
          }];
        } catch { return []; }
      },
    });
  }

  register(source: FeedSource): void {
    this.sources.set(source.name, source);
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    for (const [name, source] of this.sources) {
      if (!source.enabled) continue;
      // Initial fetch after a short delay
      const delay = Math.random() * 5000;
      setTimeout(() => this.runSource(name, source), delay);

      const timer = setInterval(() => this.runSource(name, source), source.interval);
      this.timers.set(name, timer);
    }

    this.logger.info(`FeedManager started with ${this.sources.size} sources`);
  }

  private async runSource(name: string, source: FeedSource): Promise<void> {
    try {
      const items = await source.fetch();
      for (const item of items) {
        const exists = this.items.some(i => i.id === item.id);
        if (!exists) {
          this.items.unshift(item);
          if (this.items.length > this.maxItems) this.items = this.items.slice(0, this.maxItems);
          for (const listener of this.listeners) {
            try { listener(item); } catch { /* ignore */ }
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Feed ${name} failed: ${err.message}`);
    }
  }

  stop(): void {
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    this.running = false;
  }

  subscribe(listener: (item: FeedItem) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getRecent(options: { category?: string; limit?: number; source?: string } = {}): FeedItem[] {
    let result = this.items;
    if (options.category) result = result.filter(i => i.category === options.category);
    if (options.source) result = result.filter(i => i.source === options.source);
    return result.slice(0, options.limit || 20);
  }

  getStats(): any {
    const bySource: Record<string, number> = {};
    for (const item of this.items) {
      bySource[item.source] = (bySource[item.source] || 0) + 1;
    }
    return {
      totalItems: this.items.length,
      activeSources: Array.from(this.timers.keys()).length,
      bySource,
      running: this.running,
    };
  }

  getSources(): string[] { return Array.from(this.sources.keys()); }
}
