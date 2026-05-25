<div align="center">

<pre>


     ██╗███████╗██╗     ██╗  ██╗   ██╗  ██████╗ ███████╗
     ██║██╔════╝██║     ██║  ╚██╗ ██╔╝ ██╔═══██╗██╔════╝
     ██║█████╗  ██║     ██║   ╚████╔╝  ██║   ██║███████╗
██   ██║██╔══╝  ██║     ██║    ╚██╔╝   ██║   ██║╚════██║
╚█████╔╝███████╗███████╗███████╗██║    ╚██████╔╝███████║
 ╚════╝ ╚══════╝╚══════╝╚══════╝╚═╝     ╚═════╝ ╚══════╝

     PI framework via jelly Extension.
  / commands · esc · ctrl+c exit · ctrl+e effect  BETA · Agent



</pre>

<p>
  <a href="https://github.com/jelly-chain/Solana">
    <img src="https://img.shields.io/badge/Solana-SDKs-14b8a6?style=for-the-badge" alt="Solana SDKs">
  </a>
  <a href="https://github.com/jelly-chain/BNB">
    <img src="https://img.shields.io/badge/BNB-SDKs-f59e0b?style=for-the-badge" alt="BNB SDKs">
  </a>
</p>

<p>
  <a href="http://jelly-os.xyz/">Website</a> •
  <a href="https://t.me/jellyxchain">Telegram</a> •
  <a href="https://x.com/agentz010">X / Twitter</a>
</p>

<p>
  <strong>API — <a href="https://jellychain.fun">jellychain.fun</a></strong>
</p>

</div>

---

JellyOS is a terminal AI trading agent for blockchain analytics, prediction markets, and multi-chain portfolio management. JellyOS - terminal UI, model routing, agent loop, session management, and context compaction. JellyOS provides the domain: blockchain tools, trading logic, encrypted vault, live data feeds, and skills.

---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running JellyOS](#running-jellyos)
- [How the Agent Works](#how-the-agent-works)
- [Effect Levels](#effect-levels)
- [How Dispatch Works Per Level](#how-dispatch-works-per-level)
- [How Things Are Connected](#how-things-are-connected)
- [REPL Commands](#repl-commands)
- [Tools Reference](#tools-reference)
- [Dashboard](#dashboard)
- [Security](#security)
- [License](#license)

---

## Features

- **Pi-powered terminal** — full TUI with streaming AI responses, session branching, context compaction, model switching
- **Any model** — configure any OpenRouter, OpenAI, Anthropic, Gemini, or local model via Pi's model registry
- **22 domain tools** — market data, funding rates, fear/greed, DeFi TVL, Polymarket, wallet balances, whale scanning, vault, trading, feeds, signals, prediction
- **16-chain support** — Ethereum, BSC, Arbitrum, Base, Polygon, Avalanche, Optimism, Scroll, Linea, ZkSync, Mantle, Blast, Gnosis, Celo, Solana, and more
- **Live data feeds** — always-on sources: prices, news, fear/greed, DeFi TVL, funding rates, on-chain whale data
- **Signal engine** — auto-generates directional trading signals by cross-referencing multiple feed sources
- **Encrypted vault** — AES-256-GCM profit vault with scrypt KDF; sweep realized profits in after every trade
- **Multi-chain wallets** — EVM (secp256k1), Solana (ed25519), Cosmos (ed25519) keypairs; sign without exposing private keys
- **Skills** — Pi skill system for trading, analysis, and vault discipline guides built into context
- **Jelly theme** — custom cyan/purple dark theme shipped with the package

---

## Requirements

- **Node.js 20+** (LTS recommended)
- **npm 9+**
- An API key for an AI model gateway (`OPENROUTER_API_KEY`, or configure any Pi-supported provider)
- Optional: an RPC node API key for on-chain data (`ALCHEMY_KEY`)

---

## Installation

```bash
# Clone
git clone https://github.com/jelly-chain/jellyOS.git
cd JellyOS

# One-command setup (Linux / macOS)
bash setup.sh
```

`setup.sh` will:
1. Check your Node.js version (20+ required)
3. Run `npm install`
4. Launch the interactive setup wizard (`node bin/jellyos setup`) which prompts for your API keys and writes them to `~/.jelly/.env`

**Windows:**
```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1
```

**Manual setup:**
```bash
npm install
npm run build
node bin/jellyos setup
```

---

## Configuration

The setup wizard writes your config to `~/.jellyos/.env`. You can also create it manually from the example:

```bash
cp .env.example ~/.jellyos/.env
nano ~/.jellyos/.env
```

### Required

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | API key for the AI model gateway |

### Optional — AI models

| Variable | Default | Description |
|----------|---------|-------------|
| `JELLY_MODEL_1` | Claude Sonnet | Primary model (fastest, highest quality) |
| `JELLY_MODEL_2` | GPT-4o mini | Secondary model |
| `JELLY_MODEL_3` | Gemini 2.5 Pro | Tertiary model |
| `JELLY_MODEL_4` | LLaMA 4 Maverick | Budget model (used in `eco`) |
| `JELLY_MODEL_5` | DeepSeek Chat | Fallback / swarm model |
| `JELLY_EFFECT_LEVEL` | `normal` | Default effect level: `eco` / `normal` / `turbo` / `max` |

### Optional — Data

| Variable | Description |
|----------|-------------|
| `ALCHEMY_KEY` | RPC key for on-chain data (balances, gas, whale scanning) across 16 EVM chains |
| `POLYMARKET_API_KEY` | Prediction market data and trading |
| `KALSHI_API_KEY` | Kalshi prediction market access |
| `COINGLASS_API_KEY` | Funding rate data across exchanges |

### Optional — Vault & System

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTO_VAULT_THRESHOLD` | `500` | Auto-sweep profits to vault when P&L crosses this USD amount |
| `PANIC_SWEEP_AMOUNT` | `0` | Amount to sweep on `/panic` before locking vault |
| `JELLY_DASHBOARD_PORT` | `4320` | Port for the agent's SSE server (dashboard connects here) |
| `JELLY_MAX_AGENTS` | `5` | Max parallel sub-agents in swarm mode (capped at 5) |

---

## Running JellyOS

```bash
# Start the terminal agent
node bin/jellyos

# Or if you installed globally via setup.sh:
jelly
Jellyos

```

The terminal launches with a boot animation and drops you into the `jell>` prompt.

---

## How the Agent Works

Every message you type goes through a pipeline:

```
Your input
    │
    ▼
SwarmRouter.shouldUseSwarm()
    │
    ├─ NO  → streamCompletion()
    │            │
    │            ├─ ModelRouter picks MODEL_1 (with failover to MODEL_2..5)
    │            ├─ Sends messages + tool definitions to the model
    │            ├─ Streams response tokens to your terminal
    │            └─ If model calls a tool → executes tool → continues conversation
    │
    └─ YES (turbo/max + complex prompt)
                 │
                 ▼
             runSwarm()
                 │
                 ├─ SwarmRouter.splitIntoTasks() — breaks prompt into sub-questions
                 │     (groups of 3, up to 5 worker agents + 1 reviewer)
                 │
                 ├─ SubAgentManager.runParallel() — fires all sub-agents simultaneously
                 │     each sub-agent = separate HTTP call on its own model
                 │
                 ├─ SubAgentManager.synthesize() — reviewer agent reads all results
                 │     and writes a unified answer
                 │
                 └─ Final response streamed to terminal
```

### Model failover

Every request attempts models in order `MODEL_1 → MODEL_2 → MODEL_3 → MODEL_4 → MODEL_5`. If a model returns a rate-limit error (429) or a server error (5xx), the engine immediately retries the request on the next model without dropping back to the user. Only if all five fail does an error appear in the terminal.

### AutoVault

A background timer checks the signal engine's estimated net P&L every 60 seconds. If it exceeds the `AUTO_VAULT_THRESHOLD` and the vault is unlocked, it automatically sweeps that amount into your encrypted vault. The vault then locks until you run `/unlock <passphrase>` again.

---

## Effect Levels

Switch levels at any time with `/effect <level>`:

```
jell> /effect
┌─────────────────────────────────────────┐
│  Current: normal (50%)                  │
│                                         │
│  Levels:                                │
│  eco     30%  — 1 model, no sub-agents  │
│  normal  50%  — 1 model, 1 sub-agent    │
│  turbo   70%  — 2 models, 2 sub-agents  │
│  max    100%  — 5 models, 3 sub-agents  │
└─────────────────────────────────────────┘

jell> /effect turbo
⚡ Turbo mode — 70% power. 2 sub-agents per model, parallel execution.
```

| Level | Power | Models Used | Sub-Agents | Context | Best For |
|-------|-------|-------------|------------|---------|----------|
| `eco` | 30% | Model 4 or 5 only | 0 | Compact | Balance check, simple queries |
| `normal` | 50% | Model 1 + maybe 2 | 1 | Normal | Default — most tasks |
| `turbo` | 70% | Model 1, 2, 3 | 2 per model | Full | Analysis + trade, scan + predict |
| `max` | 100% | All 5 | 3 per model | Full + parallel | Multi-chain analysis, complex strategies |

---

## How Dispatch Works Per Level

### eco (30%) — single model, zero overhead
```
User: "check BSC balance for 0x..."
→ Main agent uses MODEL_4 (lowest cost)
→ Calls get_balance tool directly
→ Done. No sub-agent.
```

### normal (50%) — main + optional 1 sub-agent
```
User: "analyze ETH"
→ Main agent uses MODEL_1
→ Dispatches 1 sub-agent on MODEL_2 for quick chain data
→ Synthesizes response
```

### turbo (70%) — parallel sub-agents
```
User: "analyze ETH and check if I should trade"
→ Main agent uses MODEL_1
→ Sub-agent A (MODEL_3): sentiment + prediction
→ Sub-agent B (MODEL_2): positions + risk
→ Both run in parallel
→ Main synthesizes → "ETH looks bullish, you have no open position. Buy?"
```

### max (100%) — full swarm
```
User: "scan BSC for whale activity, check my portfolio, predict top movers"
→ Main agent uses MODEL_1
→ Sub-agent A (MODEL_3): scan 500 blocks for whale transactions
→ Sub-agent B (MODEL_5): portfolio analysis + P&L
→ Sub-agent C (MODEL_2): predict top movers using signal engine
→ All run in parallel
→ Reviewer (MODEL_1) synthesizes all results
→ "3 whale movements detected in last 50 blocks, portfolio is +4.2%, ETH/SOL flagged as top movers"
```

---

## How Things Are Connected

```
bin/jellyos (entry point)
│
├── Loads ~/.jellyos/.env  →  sets all env vars
├── Starts AgentEngine (bootstrap)
│     ├── ModelRouter        — manages 5-model pool, tracks errors, rotates on failure
│     ├── SwarmRouter        — detects complex prompts, splits into sub-tasks (groups of 3)
│     ├── SubAgentManager    — fires parallel HTTP completions, runs reviewer synthesis
│     ├── FeedManager        — polls 7 live sources on background intervals
│     │     ├── CoinGecko       (price data)
│     │     ├── CryptoCompare   (news)
│     │     ├── Alternative.me  (fear & greed index)
│     │     ├── DeFiLlama       (TVL by chain/protocol)
│     │     ├── Polymarket      (prediction markets)
│     │     ├── Coinglass       (funding rates)
│     │     └── Alchemy         (on-chain whale watching)
│     ├── SignalEngine       — subscribes to FeedManager, generates directional signals
│     │     └── getNetPnL()  → read by AutoVault every 60 seconds
│     ├── AutoVault          — background sweep loop; sweeps to vault when PnL > threshold
│     ├── VaultManager       — AES-256-GCM vault at vault/profits.vault (scrypt KDF)
│     ├── WalletManager      — EVM/Solana/Cosmos keypairs at wallets/
│     ├── Scheduler          — cron-style task runner for recurring agent jobs
│     ├── DashboardServer    — SSE server on :4320, receives events from all components
│     └── Tools (28)         — callable by the AI model during a conversation
│
└── Ink UI (terminal)
      ├── Startup.tsx   — boot animation + ASCII header
      ├── REPL.tsx      — jell> prompt, streaming display, slash commands
      ├── AgentPanel    — side panel showing active sub-agents
      └── StatusBar     — effect level, vault status, feed health

dashboard/ (separate Vite app)
│
├── Connects to DashboardServer via SSE at localhost:4320
├── Receives real-time events: feed_item, trade_executed, vault_sweep, swarm_update, log_entry, panic
└── Pages: Overview, Portfolio, Markets, Feeds, Agents, Vault, Settings
```

### Data flow example (turbo mode, "analyze ETH and trade")

```
User types prompt
  → REPL.tsx captures input
  → AgentEngine.process() called
  → SwarmRouter detects "and" conjunction → useSwarm = true
  → runSwarm() splits into 2 sub-tasks
  → SubAgentManager fires 2 HTTP calls in parallel
      Sub-agent 1 (MODEL_3): calls get_market_data + get_signals tools
      Sub-agent 2 (MODEL_2): calls get_positions + calculate_risk tools
  → Both resolve ~2–4s later
  → Reviewer (MODEL_1) reads both results, writes synthesis
  → Response streamed token-by-token to REPL
  → DashboardServer.emit('log_entry') → dashboard updates live
```

---

## REPL Commands

```
/help              Show all commands
/effect [level]    Set effect level: eco | normal | turbo | max
/vault             Show vault balance (requires unlock)
/unlock <pass>     Unlock the encrypted vault
/lock              Lock the vault
/agents            Toggle sub-agent activity panel
/feeds             Show live feed statistics
/wallets           Show all wallet addresses
/signals           Ask agent for active trading signals
/status            Full system health check
/clear             Clear conversation history
/panic             Emergency stop: close all positions, sweep vault, lock, stop scheduler
/exit              Quit JellyOS
```

---

## Tools Reference

The AI model can call any of these tools automatically during a conversation. You can also ask for them directly in plain language.

| Tool | What it does |
|------|-------------|
| `get_balance` | Wallet balance on any of 16 supported chains |
| `sign_transaction` | Sign a message with the built-in wallet (key stays in memory) |
| `get_wallet_addresses` | Show all generated wallet addresses |
| `vault_status` | Show encrypted vault balance and stats |
| `vault_sweep` | Move an amount from trading to the vault |
| `vault_history` | Last 50 vault entries |
| `get_live_feeds` | Latest items from all active feed sources |
| `get_signals` | Active trading signals generated by the signal engine |
| `get_fear_greed` | Crypto Fear & Greed Index (current + historical) |
| `get_funding_rates` | Perpetual funding rates across exchanges |
| `get_market_data` | Prices + 24h change for up to 10 assets |
| `get_defi_tvl` | DeFiLlama TVL by chain or protocol |
| `get_gas_prices` | Gas prices across EVM chains |
| `scan_chain` | Scan recent blocks for large (whale) transactions |
| `get_polymarket` | Trending prediction markets + odds |
| `predict_market` | AI-generated price prediction for an asset |
| `execute_trade` | Submit a swap (requires explicit confirmation) |
| `get_positions` | List all open positions |
| `get_portfolio` | Full portfolio summary with P&L |
| `calculate_risk` | Risk/reward ratio + recommended position size |
| `set_stop_loss` | Update a stop-loss level (requires confirmation) |
| `execute_skill` | Run a saved trading strategy |
| `list_skills` | Show available strategy skills |
| `get_system_status` | Health check for all agent subsystems |
| `get_context` / `set_context` | Read/write persistent user context |
| `get_news` | Latest crypto news headlines |
| `get_chain_list` | All supported chains and their IDs |

---

## Dashboard

The local dashboard connects to the agent via SSE and shows live data without polling.

```bash
# Start the dashboard
cd dashboard
npm install
npm run dev

# Open http://localhost:4321
```

To build for static serving:
```bash
cd dashboard
npm run build
npm start          # serves the built output
```

The dashboard receives these real-time events from the agent:

| Event | Payload |
|-------|---------|
| `feed_item` | New data from any live feed source |
| `log_entry` | Conversation messages (agent / tool) |
| `trade_executed` | A trade was submitted |
| `vault_sweep` | Auto-vault swept profits |
| `swarm_update` | Sub-agent activity (start, complete, model used) |
| `signal_update` | New trading signal generated |
| `vault_update` | Vault balance changed |
| `panic` | Emergency stop triggered |

---

## Security

- **Private keys** are stored in `wallets/` at the project root — this directory is in `.gitignore`. Never commit it and keep the directory private.
- **Vault** is encrypted with AES-256-GCM. The key is derived from your passphrase using scrypt (memory-hard KDF) with a random per-vault salt. The same salt is stored in the vault file so the key can be reproduced deterministically from your passphrase — but the key itself is never persisted.
- **Private keys never leave the process** — signing happens in memory and only the resulting signature is returned.
- **API keys** are read from `~/.jellyos/.env` at startup and never stored anywhere else or logged.
- **Auto-lock** — vault is locked automatically on `/panic` and on process exit.

---

## License

MIT — see [LICENSE](LICENSE)
