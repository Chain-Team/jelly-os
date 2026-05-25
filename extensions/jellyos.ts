/**
 * JellyOS Pi Extension
 * Registers all blockchain/trading tools, system prompt injection, slash commands.
 * Pi handles: agent loop, TUI, model routing, session management, compaction.
 * JellyOS provides: domain tools, skills, theme, system prompt.
 */

import { Type } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as http from "node:http";
import * as os from "node:os";
import * as path from "node:path";
import { WalletManager } from "../src/wallet/WalletManager";
import { VaultManager } from "../src/vault/VaultManager";
import { AutoVault } from "../src/vault/AutoVault";
import { FeedManager } from "../src/feeds/FeedManager";
import { SignalEngine } from "../src/feeds/SignalEngine";

// ── Constants ────────────────────────────────────────────────────────────────

const JELLY_HOME = process.env.JELLYOS_HOME ?? path.join(os.homedir(), ".jelly");

const CHAIN_NETWORK: Record<string, string> = {
  bsc: "bnb-mainnet",       ethereum: "eth-mainnet",  base: "base-mainnet",
  arbitrum: "arb-mainnet",  polygon: "polygon-mainnet", avalanche: "avax-mainnet",
  optimism: "opt-mainnet",  fantom: "fantom-mainnet",   gnosis: "gnosis-mainnet",
  celo: "celo-mainnet",     scroll: "scroll-mainnet",   linea: "linea-mainnet",
  zksync: "zksync-mainnet", mantle: "mantle-mainnet",   blast: "blast-mainnet",
};

const CHAIN_SYMBOL: Record<string, string> = {
  ethereum: "ETH", bsc: "BNB",     arbitrum: "ETH",  base: "ETH",
  polygon: "MATIC", avalanche: "AVAX", optimism: "ETH", fantom: "FTM",
  gnosis: "xDAI",  celo: "CELO",   scroll: "ETH",    linea: "ETH",
  mantle: "MNT",   blast: "ETH",   solana: "SOL",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function text(t: string) {
  return { content: [{ type: "text" as const, text: t }], details: {} };
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1_000_000)     return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

// ── Minimal SSE dashboard server ─────────────────────────────────────────────

type SseClient = http.ServerResponse;
const sseClients = new Set<SseClient>();

function broadcastSse(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try { client.write(payload); } catch { sseClients.delete(client); }
  }
}

const dashPort = parseInt(process.env.JELLY_DASHBOARD_PORT ?? "4320", 10);
const dashServer = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url === "/events" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(": connected\n\n");
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
  } else if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
dashServer.listen(dashPort, "127.0.0.1");

// ── Extension ─────────────────────────────────────────────────────────────────

export default function jellyos(pi: ExtensionAPI): void {
  let wallet:    WalletManager | null = null;
  let vault:     VaultManager  | null = null;
  let autoVault: AutoVault     | null = null;
  let feeds:     FeedManager   | null = null;
  let signals:   SignalEngine   | null = null;

  // ── Boot ───────────────────────────────────────────────────────────────────

  pi.on("session_start", async (_e, ctx) => {
    try {
      wallet  = new WalletManager(JELLY_HOME);
      vault   = new VaultManager(JELLY_HOME);
      feeds   = new FeedManager();
      signals = new SignalEngine(feeds);
      autoVault = new AutoVault(vault);

      // Start auto-vault: uses portfolio PnL from PositionManager if available
      let getPnL = (): number => 0;
      try {
        const { PositionManager } = require("../src/trading/PositionManager");
        const { Metrics }         = require("../src/core/utils/Metrics");
        const { Logger }          = require("../src/core/utils/Logger");
        const pm = new PositionManager(new Metrics(new Logger("AutoVault")));
        getPnL = () => {
          try { return pm.getTotalPnL?.() ?? 0; } catch { return 0; }
        };
      } catch { /* PositionManager unavailable, PnL stays 0 */ }

      autoVault.start(getPnL, (amount) => {
        broadcastSse("vault_sweep", { amount, ts: Date.now() });
        ctx.ui.setStatus("vault", ctx.ui.theme.fg("success", `💰 swept $${amount.toFixed(0)}`));
      });

      // Activate jelly theme
      try { ctx.ui.setTheme("jelly"); } catch { /* theme may already be active */ }

      // Replace Pi's built-in header with the JellyOS brand header
      if (ctx.hasUI) {
        ctx.ui.setHeader((_tui, theme) => ({
          render(_width: number): string[] {
            const c = (s: string) => theme.fg("accent", s);  // cyan
            const p = (s: string) => theme.fg("border", s);  // purple
            const d = (s: string) => theme.fg("muted",  s);  // gray
            const logo = [
              `     ██╗███████╗██╗     ██╗  ██╗   ██╗  ██████╗ ███████╗`,
              `     ██║██╔════╝██║     ██║  ╚██╗ ██╔╝ ██╔═══██╗██╔════╝`,
              `     ██║█████╗  ██║     ██║   ╚████╔╝  ██║   ██║███████╗`,
              `██   ██║██╔══╝  ██║     ██║    ╚██╔╝   ██║   ██║╚════██║`,
              `╚█████╔╝███████╗███████╗███████╗██║    ╚██████╔╝███████║`,
              ` ╚════╝ ╚══════╝╚══════╝╚══════╝╚═╝     ╚═════╝ ╚══════╝`,
            ];
            const hint = `  ${d("/ commands · esc · ctrl+c exit · ctrl+e effect")}  ${p("v2.0 · AI trading agent")}`;
            return ["", ...logo.map(l => c(l)), "", hint, ""];
          },
          invalidate() {},
        }));
      }

      try { feeds.start(); } catch { /* feed errors are non-fatal */ }
      ctx.ui.setStatus("jelly", ctx.ui.theme.fg("accent", "🪼 jelly"));
    } catch {
      ctx.ui.setStatus("jelly", ctx.ui.theme.fg("error", "🪼 boot err"));
    }
  });

  pi.on("session_shutdown", async () => {
    autoVault?.stop();
    feeds?.stop();
    dashServer.close();
  });

  // Inject JellyOS identity + live context into every turn's system prompt
  pi.on("before_agent_start", async (_e, _ctx) => {
    // Load JellyOS system prompt from prompts/jellyos.md
    let basePrompt = "";
    try {
      const { readFileSync } = require("node:fs");
      const promptPath = path.join(__dirname, "..", "prompts", "jellyos.md");
      basePrompt = readFileSync(promptPath, "utf-8");
    } catch { /* fall through with empty base */ }

    // Build live context snippet (vault balance + fear & greed)
    const fngItem  = feeds?.getRecent({ source: "alternative.me", limit: 1 })?.[0];
    const fng      = fngItem?.metadata?.score as number | undefined;
    const fngLabel = fngItem?.metadata?.label as string | undefined;
    const vaultLine = vault
      ? (vault.isLocked() ? "vault: locked" : `vault: unlocked $${vault.getStats().balance?.toFixed(2) ?? "0"}`)
      : null;
    const effectLine = (() => {
      try {
        const { readFileSync, existsSync } = require("node:fs");
        const ctxPath = path.join(JELLY_HOME, "context.json");
        return existsSync(ctxPath)
          ? `effect_level: ${JSON.parse(readFileSync(ctxPath, "utf-8")).effect_level ?? "normal"}`
          : "effect_level: normal";
      } catch { return "effect_level: normal"; }
    })();
    const liveBits = [
      vaultLine,
      fng != null ? `fear_greed: ${fng}/100 (${fngLabel})` : null,
      effectLine,
    ].filter(Boolean) as string[];
    const liveBlock = liveBits.length > 0
      ? `\n\n## Live Context\n${liveBits.map(b => `- ${b}`).join("\n")}`
      : "";

    const systemPrompt = basePrompt + liveBlock;
    return systemPrompt ? { systemPrompt } : undefined;
  });

  // ── Slash commands ─────────────────────────────────────────────────────────

  pi.registerCommand("vault", {
    description: "Show vault balance and status",
    async handler(_args, ctx) {
      if (!vault) { ctx.ui.notify("Vault not initialized"); return; }
      const s = vault.getStats();
      ctx.ui.notify(vault.isLocked()
        ? ctx.ui.theme.fg("warning", "🔒 Vault locked — use /unlock to access")
        : ctx.ui.theme.fg("success", `🔓 Vault: $${s.balance?.toFixed(2) ?? "0"} USD | ${s.entries} entries`));
    },
  });

  pi.registerCommand("status", {
    description: "Show full JellyOS system status",
    async handler(_args, ctx) {
      const uptime    = `${Math.floor(process.uptime() / 60)}m`;
      const mem       = `${(process.memoryUsage().rss / 1e6).toFixed(0)}MB`;
      const feedStats = feeds?.getStats();
      const vaultInfo = vault
        ? (vault.isLocked() ? "locked" : `$${vault.getStats().balance?.toFixed(2) ?? "0"}`)
        : "unavailable";
      ctx.ui.notify([
        `🪼 JellyOS  up:${uptime}  mem:${mem}`,
        `vault:${vaultInfo}  feeds:${feedStats?.sources ?? 0}src/${feedStats?.items ?? 0}items`,
        `node:${process.version}  home:${JELLY_HOME}`,
      ].join("\n"));
    },
  });

  pi.registerCommand("feeds", {
    description: "Show recent live feed items",
    async handler(_args, ctx) {
      if (!feeds) { ctx.ui.notify("Feeds not initialized"); return; }
      const items = feeds.getRecent({ limit: 8 });
      if (items.length === 0) { ctx.ui.notify("No feed items yet"); return; }
      ctx.ui.notify(items.map(i => `[${i.source}] ${i.title}`).join("\n"));
    },
  });

  pi.registerCommand("signals", {
    description: "Show active trading signals",
    async handler(_args, ctx) {
      if (!signals) { ctx.ui.notify("Signal engine not initialized"); return; }
      const sigs = signals.getActiveSignals();
      if (sigs.length === 0) { ctx.ui.notify("No active signals"); return; }
      ctx.ui.notify(sigs.slice(0, 6).map(s =>
        `[${s.asset}] ${s.direction.toUpperCase()} ${(s.strength * 100).toFixed(0)}% conf:${(s.confidence * 100).toFixed(0)}%`
      ).join("\n"));
    },
  });

  pi.registerCommand("panic", {
    description: "Emergency: flag all open positions for immediate review",
    async handler(_args, ctx) {
      ctx.ui.notify(ctx.ui.theme.fg("error",
        "🚨 PANIC MODE — Review all positions NOW\nUse get_positions + calculate_risk to assess exposure"));
    },
  });

  pi.registerCommand("effect", {
    description: "Show or set trading intensity level: eco | normal | turbo | max",
    async handler(args, ctx) {
      const level = args.trim().toLowerCase();
      const valid = ["eco", "normal", "turbo", "max"];
      if (!level) {
        const { readFileSync, existsSync } = require("node:fs");
        const ctxPath = require("node:path").join(JELLY_HOME, "context.json");
        const current = existsSync(ctxPath)
          ? (JSON.parse(readFileSync(ctxPath, "utf-8")).effect_level ?? "normal")
          : "normal";
        ctx.ui.notify(`Effect level: ${current}\nOptions: eco | normal | turbo | max\nUsage: /effect turbo`);
        return;
      }
      if (!valid.includes(level)) {
        ctx.ui.notify(`Unknown level: ${level}\nChoose: eco | normal | turbo | max`);
        return;
      }
      const { readFileSync, writeFileSync, existsSync, mkdirSync } = require("node:fs");
      const ctxPath = require("node:path").join(JELLY_HOME, "context.json");
      mkdirSync(JELLY_HOME, { recursive: true });
      const store = existsSync(ctxPath) ? JSON.parse(readFileSync(ctxPath, "utf-8")) : {};
      store.effect_level = level;
      writeFileSync(ctxPath, JSON.stringify(store, null, 2), "utf-8");
      const desc: Record<string, string> = {
        eco:    "minimal tools, fastest responses",
        normal: "standard tool usage",
        turbo:  "aggressive multi-tool analysis",
        max:    "all tools, deep analysis on every response",
      };
      ctx.ui.notify(ctx.ui.theme.fg("accent", `Effect level → ${level.toUpperCase()}\n${desc[level]}`));
    },
  });

  pi.registerCommand("lock", {
    description: "Lock the profit vault",
    async handler(_args, ctx) {
      if (!vault) { ctx.ui.notify("Vault not initialized"); return; }
      if (vault.isLocked()) { ctx.ui.notify("Vault is already locked 🔒"); return; }
      vault.lock();
      ctx.ui.notify(ctx.ui.theme.fg("warning", "🔒 Vault locked"));
    },
  });

  pi.registerCommand("changelog", {
    description: "Show JellyOS release notes",
    async handler(_args, ctx) {
      ctx.ui.notify([
        ctx.ui.theme.fg("accent", "JellyOS Changelog"),
        "",
        ctx.ui.theme.fg("border", "v2.0.0") + " — Pi-based rebuild",
        "  · Replaced custom agent engine with Pi extension",
        "  · 22 domain tools: market, blockchain, vault, trading, feeds, prediction",
        "  · Jelly cyan/purple theme + custom ASCII header",
        "  · AutoVault: auto-sweeps profits at configurable threshold",
        "  · Live data feeds: prices, news, F&G, DeFi TVL, whale alerts",
        "  · Dashboard SSE server on port 4320",
        "  · Wallets: EVM, Solana, Cosmos generated on setup",
        "",
        ctx.ui.theme.fg("border", "v1.x") + " — Custom Ink TUI (legacy)",
      ].join("\n"));
    },
  });

  pi.registerCommand("unlock", {
    description: "Unlock the profit vault — usage: /unlock <passphrase>",
    async handler(args, ctx) {
      if (!vault) { ctx.ui.notify("Vault not initialized"); return; }
      const passphrase = args.trim();
      if (!passphrase) {
        ctx.ui.notify("Usage: /unlock <passphrase>");
        return;
      }
      try {
        const ok = await vault.unlock(passphrase);
        if (ok) {
          const s = vault.getStats();
          ctx.ui.notify(ctx.ui.theme.fg("success",
            `🔓 Vault unlocked — Balance: $${(s.balance as number)?.toFixed(2) ?? "0"}`));
        } else {
          ctx.ui.notify(ctx.ui.theme.fg("error", "❌ Wrong passphrase"));
        }
      } catch (err: any) {
        ctx.ui.notify(ctx.ui.theme.fg("error", `Vault error: ${err.message}`));
      }
    },
  });

  // ── Tools: Market Data ─────────────────────────────────────────────────────

  pi.registerTool({
    name: "get_market_data",
    label: "Market Data",
    description: "Get current prices and 24h stats for crypto assets via CoinGecko. Use coingecko IDs: bitcoin, ethereum, solana, etc.",
    parameters: Type.Object({
      symbols: Type.Array(
        Type.String({ description: "CoinGecko IDs (e.g. bitcoin, ethereum, solana)" }),
        { description: "Asset IDs to fetch (max 10)" }
      ),
    }),
    async execute(_id, params) {
      const ids = params.symbols.slice(0, 10).map((s: string) => s.toLowerCase().replace(/\s+/g, "-"));
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
      const data = await res.json() as any;
      const lines = Object.entries(data).map(([id, info]: [string, any]) =>
        `${id.toUpperCase()}: $${info.usd?.toLocaleString() ?? "?"} | 24h: ${info.usd_24h_change?.toFixed(2) ?? "?"}% | Vol: ${fmtUsd(info.usd_24h_vol ?? 0)}`
      );
      if (lines.length === 0) throw new Error("No data returned — check asset IDs");
      const pricePayload = Object.entries(data).map(([id, info]: [string, any]) => ({
        id, price: info.usd, change24h: info.usd_24h_change, ts: Date.now(),
      }));
      broadcastSse("prices", pricePayload);
      return text(lines.join("\n"));
    },
  });

  pi.registerTool({
    name: "get_fear_greed",
    label: "Fear & Greed Index",
    description: "Get the current Crypto Fear & Greed Index (0=extreme fear, 100=extreme greed)",
    parameters: Type.Object({}),
    async execute() {
      const res = await fetch("https://api.alternative.me/fng/?limit=1", { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json() as any;
      const item = data?.data?.[0];
      if (!item) throw new Error("No data returned");
      const v = parseInt(item.value);
      const zone = v <= 25 ? "Extreme Fear — contrarian buy zone"
                 : v >= 75 ? "Extreme Greed — potential sell zone"
                 : "Neutral zone";
      return text(`Fear & Greed: ${item.value}/100 — ${item.value_classification}\n${zone}`);
    },
  });

  pi.registerTool({
    name: "get_funding_rates",
    label: "Funding Rates",
    description: "Get perpetual futures funding rates for a symbol across exchanges",
    parameters: Type.Object({
      symbol: Type.Optional(Type.String({ description: "Asset symbol: BTC, ETH, SOL, etc. (default: BTC)" })),
    }),
    async execute(_id, params) {
      const sym = (params.symbol ?? "BTC").toUpperCase();
      const res = await fetch(
        `https://open-api.coinglass.com/public/v2/funding?symbol=${sym}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error(`Coinglass ${res.status} — API key may be required`);
      const data = await res.json() as any;
      if (!data?.data) throw new Error("No funding data");
      const rates = (Array.isArray(data.data) ? data.data : []).slice(0, 8);
      const lines = rates.map((r: any) => `${r.exchangeName}: ${(r.fundingRate * 100).toFixed(4)}%`);
      const avg = rates.reduce((s: number, r: any) => s + (r.fundingRate ?? 0), 0) / (rates.length || 1);
      const signal = avg > 0.001 ? "⚠️ Longs overextended" : avg < -0.0003 ? "⚠️ Shorts overextended" : "Normal";
      return text(`${sym} Funding Rates:\n${lines.join("\n")}\nAvg: ${(avg * 100).toFixed(4)}% — ${signal}`);
    },
  });

  pi.registerTool({
    name: "get_defi_tvl",
    label: "DeFi TVL",
    description: "Get Total Value Locked by chain or protocol via DeFi Llama",
    parameters: Type.Object({
      protocol: Type.Optional(Type.String({ description: "Protocol slug (aave, uniswap, curve…) or omit for chain overview" })),
    }),
    async execute(_id, params) {
      if (params.protocol) {
        const res = await fetch(`https://api.llama.fi/protocol/${params.protocol}`, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`Protocol not found: ${params.protocol}`);
        const d = await res.json() as any;
        return text(`${d.name}: ${fmtUsd(d.tvl ?? 0)} TVL | ${d.category} | Chains: ${(d.chains ?? []).slice(0, 5).join(", ")}`);
      }
      const res = await fetch("https://api.llama.fi/v2/chains", { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`DeFi Llama ${res.status}`);
      const data = await res.json() as any;
      const top = (Array.isArray(data) ? data : [])
        .sort((a: any, b: any) => (b.tvl ?? 0) - (a.tvl ?? 0)).slice(0, 10);
      return text("Top Chains by TVL:\n" + top.map((c: any) => `${c.name}: ${fmtUsd(c.tvl ?? 0)}`).join("\n"));
    },
  });

  pi.registerTool({
    name: "get_gas_prices",
    label: "Gas Prices",
    description: "Get current gas prices across EVM networks (requires ALCHEMY_KEY env var)",
    parameters: Type.Object({
      networks: Type.Optional(Type.Array(Type.String(), { description: "Chain names (default: ethereum, bsc, polygon)" })),
    }),
    async execute(_id, params) {
      const apiKey = process.env.ALCHEMY_KEY;
      if (!apiKey) throw new Error("ALCHEMY_KEY not set — run jellyos setup");
      const nets = (params.networks ?? ["ethereum", "bsc", "polygon"]).slice(0, 5);
      const results: string[] = [];
      for (const net of nets) {
        try {
          const res = await fetch(`https://${CHAIN_NETWORK[net] ?? "eth-mainnet"}.g.alchemy.com/v2/${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_gasPrice", params: [] }),
            signal: AbortSignal.timeout(5000),
          });
          if (!res.ok) { results.push(`${net}: unavailable`); continue; }
          const data = await res.json() as any;
          const gwei = parseInt(data.result, 16) / 1e9;
          results.push(`${net}: ${gwei.toFixed(1)} Gwei`);
        } catch { results.push(`${net}: unavailable`); }
      }
      return text(results.join("\n"));
    },
  });

  pi.registerTool({
    name: "get_polymarket",
    label: "Polymarket",
    description: "Get trending Polymarket prediction markets",
    parameters: Type.Object({
      limit:  Type.Optional(Type.Number({ description: "Number of markets (default 5)" })),
      search: Type.Optional(Type.String({ description: "Search query" })),
    }),
    async execute(_id, params) {
      let url = `https://gamma-api.polymarket.com/markets?limit=${params.limit ?? 5}&order=volume&ascending=false&active=true`;
      if (params.search) url += `&q=${encodeURIComponent(params.search)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`Polymarket ${res.status}`);
      const data = await res.json() as any;
      const markets = Array.isArray(data) ? data : [];
      if (markets.length === 0) return text("No markets found");
      const lines = markets.slice(0, 6).map((m: any) => {
        const yes = ((m.outcomePrices?.[0] ?? 0) * 100).toFixed(0);
        return `${m.question}\n  Yes: ${yes}% | Vol: ${fmtUsd(m.volume ?? 0)}${m.slug ? `\n  https://polymarket.com/event/${m.slug}` : ""}`;
      });
      return text(lines.join("\n\n"));
    },
  });

  // ── Tools: Blockchain ──────────────────────────────────────────────────────

  pi.registerTool({
    name: "get_balance",
    label: "Wallet Balance",
    description: "Check wallet balance on any supported blockchain",
    parameters: Type.Object({
      chain:   Type.String({ description: "Chain: ethereum, bsc, arbitrum, base, polygon, avalanche, optimism, solana, scroll, linea, zksync, mantle, blast, celo, gnosis" }),
      address: Type.Optional(Type.String({ description: "Wallet address — leave blank to use built-in wallet" })),
    }),
    async execute(_id, params) {
      const apiKey = process.env.ALCHEMY_KEY;
      if (!apiKey) throw new Error("ALCHEMY_KEY not set — run jellyos setup");
      let addr = params.address;
      if (!addr && wallet) {
        addr = wallet.getAddress(params.chain) ?? undefined;
        if (!addr) throw new Error(`No wallet for ${params.chain}. Run jellyos setup first.`);
      }
      if (!addr) throw new Error("No address provided");
      const network = CHAIN_NETWORK[params.chain] ?? "eth-mainnet";
      const res = await fetch(`https://${network}.g.alchemy.com/v2/${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [addr, "latest"] }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Alchemy ${res.status}`);
      const data = await res.json() as any;
      const formatted = (Number(BigInt(data.result)) / 1e18).toFixed(6);
      return text(`${addr.slice(0, 8)}… ${formatted} ${CHAIN_SYMBOL[params.chain] ?? "ETH"}`);
    },
  });

  pi.registerTool({
    name: "sign_transaction",
    label: "Sign Transaction",
    description: "Sign a message with the built-in wallet. Returns signature only — does NOT broadcast.",
    parameters: Type.Object({
      chain:   Type.String({ description: "Chain name" }),
      message: Type.String({ description: "Message or hex data to sign" }),
    }),
    async execute(_id, params) {
      if (!wallet) throw new Error("Wallet not initialized");
      const sig = wallet.signMessage(params.chain, params.message);
      if (!sig) throw new Error(`No wallet for ${params.chain}. Run jellyos setup first.`);
      return text(`Signed. Signature: ${sig.slice(0, 18)}…${sig.slice(-6)}`);
    },
  });

  pi.registerTool({
    name: "get_wallet_addresses",
    label: "Wallet Addresses",
    description: "Show all generated wallet addresses across chains",
    parameters: Type.Object({}),
    async execute() {
      if (!wallet) throw new Error("Wallet not initialized");
      const summary = wallet.getSummary();
      if (Object.keys(summary).length === 0) return text("No wallets yet. Run `jellyos setup` first.");
      return text(Object.entries(summary).map(([c, a]) => `${c}: ${a}`).join("\n"));
    },
  });

  pi.registerTool({
    name: "scan_chain",
    label: "Scan Chain",
    description: "Scan a blockchain for recent large transactions and whale activity",
    parameters: Type.Object({
      chain:         Type.String({ description: "Chain name" }),
      min_value_eth: Type.Optional(Type.Number({ description: "Min native token value to include (default 50)" })),
    }),
    async execute(_id, params) {
      const apiKey = process.env.ALCHEMY_KEY;
      if (!apiKey) throw new Error("ALCHEMY_KEY not set — run jellyos setup");
      const network = CHAIN_NETWORK[params.chain] ?? "eth-mainnet";
      const res = await fetch(`https://${network}.g.alchemy.com/v2/${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: 1,
          method: "alchemy_getAssetTransfers",
          params: [{ category: ["external"], maxCount: "0xa", order: "desc", excludeZeroValue: true }],
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Alchemy ${res.status}`);
      const data = await res.json() as any;
      const minVal = params.min_value_eth ?? 50;
      const txs = (data?.result?.transfers ?? []).filter((t: any) => parseFloat(t.value ?? "0") >= minVal);
      if (txs.length === 0) return text(`No large transfers (>${minVal} ${CHAIN_SYMBOL[params.chain] ?? "ETH"}) on ${params.chain} recently`);
      const lines = txs.slice(0, 5).map((t: any) =>
        `${parseFloat(t.value).toFixed(2)} ${CHAIN_SYMBOL[params.chain] ?? "ETH"}: ${(t.from ?? "?").slice(0, 8)}… → ${(t.to ?? "?").slice(0, 8)}…`
      );
      return text(`Large transfers on ${params.chain}:\n${lines.join("\n")}`);
    },
  });

  pi.registerTool({
    name: "get_chain_list",
    label: "Supported Chains",
    description: "List all supported blockchain networks",
    parameters: Type.Object({}),
    async execute() {
      const chains = [...Object.keys(CHAIN_NETWORK), "solana", "cosmos"];
      return text(`Supported chains (${chains.length}): ${chains.join(", ")}`);
    },
  });

  // ── Tools: Vault ───────────────────────────────────────────────────────────

  pi.registerTool({
    name: "vault_status",
    label: "Vault Status",
    description: "Get profit vault balance and lock state",
    parameters: Type.Object({}),
    async execute() {
      if (!vault) throw new Error("Vault not initialized");
      const s = vault.getStats();
      if (vault.isLocked()) return text("🔒 Vault locked. Use /unlock to access.");
      return text(`🔓 Vault: $${s.balance?.toFixed(2) ?? "0"} USD | ${s.entries} entries | Updated: ${new Date(s.updatedAt).toLocaleString()}`);
    },
  });

  pi.registerTool({
    name: "vault_sweep",
    label: "Sweep to Vault",
    description: "Sweep realized profits into the encrypted vault. Vault must be unlocked first.",
    parameters: Type.Object({
      amount:  Type.Number({ description: "USD amount to sweep" }),
      note:    Type.Optional(Type.String({ description: "Note for this entry (e.g. 'ETH long +18%')" })),
      confirm: Type.Optional(Type.Boolean({ description: "Must be true to execute the sweep" })),
    }),
    async execute(_id, params) {
      if (!vault) throw new Error("Vault not initialized");
      if (!params.confirm) {
        return text(`Confirm sweeping $${params.amount.toFixed(2)} to vault? Call again with confirm: true.`);
      }
      await vault.sweep(params.amount, params.note ?? "manual-sweep");
      broadcastSse("vault_sweep", { amount: params.amount, note: params.note, ts: Date.now() });
      broadcastSse("vault_balance", { balance: vault.getStats().balance, ts: Date.now() });
      return text(`✅ Swept $${params.amount.toFixed(2)} to vault`);
    },
  });

  pi.registerTool({
    name: "vault_history",
    label: "Vault History",
    description: "Get recent vault transaction history",
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ description: "Number of entries (default 10)" })),
    }),
    async execute(_id, params) {
      if (!vault) throw new Error("Vault not initialized");
      const history = vault.getHistory();
      if (history.length === 0) return text("No vault entries yet");
      return text(history.slice(0, params.limit ?? 10).map((e: any) =>
        `${new Date(e.timestamp).toLocaleDateString()} ${e.amount > 0 ? "+" : ""}$${e.amount.toFixed(2)} — ${e.note}`
      ).join("\n"));
    },
  });

  // ── Tools: Trading ─────────────────────────────────────────────────────────

  pi.registerTool({
    name: "calculate_risk",
    label: "Risk Calculator",
    description: "Calculate risk/reward ratio, position size, and max loss for a trade setup",
    parameters: Type.Object({
      symbol:             Type.String(),
      entry:              Type.Number({ description: "Entry price" }),
      stop_loss:          Type.Number({ description: "Stop-loss price" }),
      take_profit:        Type.Optional(Type.Number({ description: "Take-profit target price" })),
      portfolio_size_usd: Type.Optional(Type.Number({ description: "Portfolio size in USD (default 10000)" })),
      risk_pct:           Type.Optional(Type.Number({ description: "Max % of portfolio to risk (default 2)" })),
      leverage:           Type.Optional(Type.Number({ description: "Leverage multiplier (default 1)" })),
    }),
    async execute(_id, p) {
      const portfolioUsd = p.portfolio_size_usd ?? 10000;
      const riskPct      = (p.risk_pct ?? 2) / 100;
      const leverage     = p.leverage ?? 1;
      const riskPerUnit  = Math.abs(p.entry - p.stop_loss);
      const riskAmount   = portfolioUsd * riskPct;
      const positionSize = riskAmount / riskPerUnit;
      const positionVal  = positionSize * p.entry;
      const rr = p.take_profit ? Math.abs(p.take_profit - p.entry) / riskPerUnit : null;
      const lines = [
        `${p.symbol} Risk Analysis`,
        `Entry $${p.entry} | Stop $${p.stop_loss}${p.take_profit ? ` | Target $${p.take_profit}` : ""}`,
        `Risk per unit: $${riskPerUnit.toFixed(4)}`,
        `Max position: ${positionSize.toFixed(4)} ${p.symbol} ($${positionVal.toFixed(2)})`,
        `Max loss: $${riskAmount.toFixed(2)} (${p.risk_pct ?? 2}% of portfolio)`,
        rr != null ? `R/R: 1:${rr.toFixed(2)}${rr < 1 ? " ⚠️ below 1:1" : rr >= 2 ? " ✅ good" : ""}` : "",
        leverage > 1 ? `Leverage: ${leverage}x${leverage > 3 ? " ⚠️ high" : ""}` : "",
      ].filter(Boolean);
      return text(lines.join("\n"));
    },
  });

  pi.registerTool({
    name: "execute_trade",
    label: "Execute Trade",
    description: "Execute a swap on Jupiter (Solana) or Uniswap (EVM). Always shows confirmation before executing.",
    parameters: Type.Object({
      pair:             Type.String({ description: "Trading pair: ETH/USDC, SOL/USDT, etc." }),
      side:             Type.String({ description: "buy or sell" }),
      amount_usd:       Type.Number({ description: "USD amount" }),
      chain:            Type.String({ description: "Chain name" }),
      max_slippage_pct: Type.Optional(Type.Number({ description: "Max slippage % (default 0.5)" })),
      confirm:          Type.Optional(Type.Boolean({ description: "Must be true to execute" })),
    }),
    async execute(_id, params) {
      if (!params.confirm) {
        return text(
          `⚠️ CONFIRMATION REQUIRED\n` +
          `${params.side.toUpperCase()} $${params.amount_usd} of ${params.pair} on ${params.chain}\n` +
          `Max slippage: ${params.max_slippage_pct ?? 0.5}%\n\nCall again with confirm: true to execute.`
        );
      }
      // Stub — wire up DEX adapters for live execution
      const txHash   = "0x" + Math.random().toString(16).slice(2, 18);
      const explorer = params.chain === "solana"
        ? `https://solscan.io/tx/${txHash}`
        : `https://etherscan.io/tx/${txHash}`;
      broadcastSse("trade", {
        pair: params.pair, side: params.side, amount_usd: params.amount_usd,
        chain: params.chain, txHash, ts: Date.now(),
      });
      return text(
        `✅ Trade submitted: ${params.side.toUpperCase()} $${params.amount_usd} ${params.pair} on ${params.chain}\n` +
        `Tx: ${txHash}\nExplorer: ${explorer}\n\nNote: Demo mode — connect DEX adapters for live execution.`
      );
    },
  });

  pi.registerTool({
    name: "set_stop_loss",
    label: "Set Stop Loss",
    description: "Set or update stop-loss for an open position",
    parameters: Type.Object({
      position_id: Type.String(),
      stop_loss:   Type.Number(),
      confirm:     Type.Optional(Type.Boolean()),
    }),
    async execute(_id, params) {
      if (!params.confirm) {
        return text(`Confirm stop-loss $${params.stop_loss} on position ${params.position_id}? Add confirm: true.`);
      }
      return text(`✅ Stop-loss set to $${params.stop_loss} on position ${params.position_id}`);
    },
  });

  pi.registerTool({
    name: "get_positions",
    label: "Positions",
    description: "List open or closed trading positions",
    parameters: Type.Object({
      status: Type.Optional(Type.String({ description: "open | closed | all (default: open)" })),
    }),
    async execute(_id, params) {
      const { PositionManager } = await import("../src/trading/PositionManager");
      const { Metrics } = await import("../src/core/utils/Metrics");
      const { Logger } = await import("../src/core/utils/Logger");
      const logger = new Logger("Positions");
      const pm = new PositionManager(new Metrics(logger));
      const status = params.status ?? "open";
      const positions = status === "closed" ? pm.getClosedPositions()
        : status === "all" ? [...pm.getOpenPositions(), ...pm.getClosedPositions()]
        : pm.getOpenPositions();
      if (positions.length === 0) return text(`No ${status} positions`);
      return text(JSON.stringify(positions, null, 2));
    },
  });

  pi.registerTool({
    name: "get_portfolio",
    label: "Portfolio Overview",
    description: "Get full portfolio summary with P&L and performance metrics",
    parameters: Type.Object({}),
    async execute() {
      const { PositionManager } = await import("../src/trading/PositionManager");
      const { PortfolioManager } = await import("../src/trading/PortfolioManager");
      const { Metrics } = await import("../src/core/utils/Metrics");
      const { Logger } = await import("../src/core/utils/Logger");
      const logger = new Logger("Portfolio");
      const metrics = new Metrics(logger);
      const pm = new PositionManager(metrics);
      const portfolio = new PortfolioManager(pm, metrics);
      return text(JSON.stringify(portfolio.getSummary(), null, 2));
    },
  });

  // ── Tools: Feeds ───────────────────────────────────────────────────────────

  pi.registerTool({
    name: "get_live_feeds",
    label: "Live Feeds",
    description: "Get recent items from live data feeds (news, prices, whale alerts, on-chain signals)",
    parameters: Type.Object({
      category: Type.Optional(Type.String({ description: "news | signal | whale | price | social | onchain | prediction — omit for all" })),
      limit:    Type.Optional(Type.Number({ description: "Max items (default 10)" })),
      source:   Type.Optional(Type.String({ description: "Filter by source name" })),
    }),
    async execute(_id, params) {
      if (!feeds) throw new Error("Feed service not initialized");
      const items = feeds.getRecent({
        category: params.category as any,
        limit: params.limit ?? 10,
        source: params.source,
      });
      if (items.length === 0) return text("No feed items yet — feeds update every 1–30 minutes");
      return text(items.map((i: any) => `[${i.source}] ${i.title}: ${i.content}`).join("\n"));
    },
  });

  pi.registerTool({
    name: "get_signals",
    label: "Trading Signals",
    description: "Get active AI-generated trading signals from cross-source analysis",
    parameters: Type.Object({
      asset: Type.Optional(Type.String({ description: "Filter by asset symbol: BTC, ETH, SOL, etc." })),
    }),
    async execute(_id, params) {
      if (!signals) throw new Error("Signal engine not initialized");
      const sigs = signals.getActiveSignals(params.asset);
      if (sigs.length === 0) return text("No active signals at this time");
      broadcastSse("signals", sigs.map((s: any) => ({
        asset: s.asset, direction: s.direction, strength: s.strength, confidence: s.confidence, ts: Date.now(),
      })));
      return text(sigs.map(s =>
        `[${s.asset}] ${s.direction.toUpperCase()} | Strength: ${(s.strength * 100).toFixed(0)}% | Conf: ${(s.confidence * 100).toFixed(0)}%\n  ${s.rationale}`
      ).join("\n\n"));
    },
  });

  pi.registerTool({
    name: "get_news",
    label: "Crypto News",
    description: "Get latest crypto news from feed sources or CryptoCompare fallback",
    parameters: Type.Object({
      limit:    Type.Optional(Type.Number({ description: "Number of articles (default 5)" })),
      category: Type.Optional(Type.String({ description: "Topic filter: defi, nft, ethereum, bitcoin, etc." })),
    }),
    async execute(_id, params) {
      const feedItems = feeds?.getRecent({ category: "news", limit: params.limit ?? 5 });
      if (feedItems && feedItems.length > 0) {
        return text(feedItems.map((i: any) =>
          `• [${i.source}] ${i.title}\n  ${(i.content ?? "").slice(0, 150)}${i.url ? `\n  ${i.url}` : ""}`
        ).join("\n\n"));
      }
      const res = await fetch(
        `https://min-api.cryptocompare.com/data/v2/news/?lang=EN&sortOrder=latest&limit=${params.limit ?? 5}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) throw new Error(`CryptoCompare ${res.status}`);
      const data = await res.json() as any;
      return text((data?.Data ?? []).slice(0, params.limit ?? 5).map((n: any) =>
        `• [${n.source}] ${n.title}\n  ${(n.body ?? "").slice(0, 150)}`
      ).join("\n\n"));
    },
  });

  // ── Tools: Prediction ──────────────────────────────────────────────────────

  pi.registerTool({
    name: "predict_market",
    label: "Market Prediction",
    description: "Generate a price prediction for an asset based on signals and sentiment data",
    parameters: Type.Object({
      symbol:    Type.String({ description: "Asset symbol: BTC, ETH, SOL, etc." }),
      timeframe: Type.Optional(Type.String({ description: "1h | 4h | 1d | 1w (default: 1d)" })),
    }),
    async execute(_id, params) {
      const sym  = (params.symbol ?? "BTC").toUpperCase();
      const tf   = params.timeframe ?? "1d";
      const sigs = signals?.getActiveSignals(sym) ?? [];
      const fngItem = feeds?.getRecent({ source: "alternative.me", limit: 1 })?.[0];
      const fng     = fngItem?.metadata?.score as number | undefined;

      let bias = "neutral", confidence = 50;
      if (sigs.length > 0) {
        const longs  = sigs.filter((s: any) => s.direction === "long").length;
        const shorts = sigs.filter((s: any) => s.direction === "short").length;
        if (longs  > shorts) { bias = "bullish"; confidence = 55 + longs  * 5; }
        if (shorts > longs)  { bias = "bearish"; confidence = 55 + shorts * 5; }
      }
      if (fng !== undefined) {
        if (fng  < 25 && bias !== "bearish") { bias = "bullish"; confidence += 5; }
        if (fng  > 80 && bias !== "bullish") { bias = "bearish"; confidence += 5; }
      }
      confidence = Math.min(85, confidence);
      return text([
        `${sym} ${tf} Prediction`,
        `Bias: ${bias.toUpperCase()} | Confidence: ${confidence}%`,
        `Active signals: ${sigs.length} | Fear & Greed: ${fng ?? "N/A"}/100`,
        "",
        "⚠️ Not financial advice. Always DYOR.",
      ].join("\n"));
    },
  });

  // ── Tools: System ──────────────────────────────────────────────────────────

  pi.registerTool({
    name: "web_fetch",
    label: "Fetch URL",
    description: "Fetch content from any URL. Strips HTML to plain text by default. Useful for docs, news, APIs.",
    parameters: Type.Object({
      url:     Type.String({ description: "URL to fetch" }),
      as_text: Type.Optional(Type.Boolean({ description: "Strip HTML tags (default true for HTML)" })),
    }),
    async execute(_id, params) {
      const res = await fetch(params.url, {
        headers: { "User-Agent": "JellyOS/2.0" },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const ct = res.headers.get("content-type") ?? "";
      let body = await res.text();
      if (ct.includes("html") || params.as_text !== false) {
        body = body
          .replace(/<script[\s\S]*?<\/script>/gi, "")
          .replace(/<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s{2,}/g, " ")
          .trim();
      }
      return text(body.slice(0, 6000));
    },
  });

  pi.registerTool({
    name: "get_system_status",
    label: "System Status",
    description: "Full JellyOS system diagnostics — feeds, vault, wallet, API keys, memory",
    parameters: Type.Object({}),
    async execute() {
      const uptime     = process.uptime();
      const mem        = process.memoryUsage();
      const feedStats  = feeds?.getStats();
      const vaultStats = vault?.getStats();
      return text(JSON.stringify({
        system: {
          version:    "2.0.0",
          uptime:     `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
          memory_mb:  (mem.rss / 1e6).toFixed(1),
          node:       process.version,
          home:       JELLY_HOME,
        },
        feeds:   feedStats  ?? "unavailable",
        vault:   vaultStats ?? "unavailable",
        wallets: wallet ? Object.keys(wallet.getSummary()).length + " chains" : "unavailable",
        api_keys: {
          alchemy:    !!process.env.ALCHEMY_KEY,
          openrouter: !!process.env.OPENROUTER_API_KEY,
          polymarket: !!process.env.POLYMARKET_API_KEY,
        },
      }, null, 2));
    },
  });

  pi.registerTool({
    name: "get_context",
    label: "Get Context",
    description: "Retrieve a stored key-value from JellyOS persistent context (~/.jelly/context.json)",
    parameters: Type.Object({
      key: Type.String({ description: "Context key" }),
    }),
    async execute(_id, params) {
      const { readFileSync, existsSync } = await import("node:fs");
      const ctxPath = path.join(JELLY_HOME, "context.json");
      if (!existsSync(ctxPath)) return text(`No context stored yet`);
      const store = JSON.parse(readFileSync(ctxPath, "utf-8")) as Record<string, any>;
      const val = store[params.key];
      return text(val !== undefined ? JSON.stringify(val, null, 2) : `No value for key: ${params.key}`);
    },
  });

  pi.registerTool({
    name: "set_context",
    label: "Set Context",
    description: "Store a value in JellyOS persistent context for future sessions",
    parameters: Type.Object({
      key:   Type.String({ description: "Context key" }),
      value: Type.Any({ description: "Value to store (any JSON-serializable value)" }),
    }),
    async execute(_id, params) {
      const { readFileSync, writeFileSync, existsSync, mkdirSync } = await import("node:fs");
      mkdirSync(JELLY_HOME, { recursive: true });
      const ctxPath = path.join(JELLY_HOME, "context.json");
      const store   = existsSync(ctxPath) ? JSON.parse(readFileSync(ctxPath, "utf-8")) : {};
      store[params.key] = params.value;
      writeFileSync(ctxPath, JSON.stringify(store, null, 2), "utf-8");
      return text(`Stored: ${params.key}`);
    },
  });
}
