<!--
  Beanance Backend
  Place your logo at: docs/assets/beanance-logo.png
  Then the image below will render automatically on GitHub.
-->

<div align="center">
  <img src="docs/assets/beanance-logo.png" alt="Beanance logo" width="180" />
  <h1>Beanance Backend</h1>
  <p><strong>Backend infrastructure for a strategy-driven crypto trading platform.</strong></p>
  <p>
    <img src="https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white" alt="Node.js 20+" />
    <img src="https://img.shields.io/badge/Fastify-5-black?logo=fastify" alt="Fastify 5" />
    <img src="https://img.shields.io/badge/Database-SQLite-003B57?logo=sqlite&logoColor=white" alt="SQLite" />
    <img src="https://img.shields.io/badge/Market-Binance%20USD%E2%93%88--M-F0B90B?logo=binance&logoColor=black" alt="Binance USD-M Futures" />
  </p>
</div>

---

## Project Overview

Beanance is being built as a strategy-driven crypto trading platform. The product direction combines:

- **Strategy marketplace** — creators publish, explain, and distribute trading strategies.
- **Strategy access controls** — creators can define eligibility rules, potentially including token ownership.
- **Copy trading** — users connect exchange accounts and follow supported strategies with explicit risk controls.
- **Market intelligence** — live Binance USDⓈ-M Futures data, technical indicators, derivatives analytics, trade-flow CVD, order-book depth, and liquidity heatmap history.

This repository contains the **Beanance backend**. It is currently an MVP foundation: authentication, profile management, encrypted wallet and exchange credential storage, and the Binance Futures market-data module are implemented. Strategy publishing, token-gating, and copy-trading execution are not implemented yet.

> **Important:** Market-data endpoints are public. User wallet and exchange-account endpoints require JWT authentication. The current Binance integration is read-only and does not place orders.

## Current Implementation Status

| Domain | Status | Notes |
| --- | --- | --- |
| Fastify application | Implemented | Fastify 5, versioned API under `/api/v1` |
| SQLite persistence | Implemented | better-sqlite3, WAL, foreign keys, startup migrations |
| Authentication | Implemented | Email registration verification, password login, Google ID-token login, JWT |
| Profile management | Implemented | Username/avatar updates and password change verification |
| BNB Smart Chain wallet | Implemented | Create/import/list/manage wallets; encrypted secrets |
| Binance exchange connection | Implemented | Encrypted API credentials and signed read-only account verification |
| Futures market data | Implemented | Binance USDⓈ-M Futures ticker stream and REST-backed market data |
| Technical indicators | Implemented | EMA/SMA, RSI, MACD, Bollinger Bands, ATR, ADX and additional indicators |
| Trade-flow CVD | Implemented | AggTrade stream, aggressor-side classification, persisted trade history |
| Order book | Implemented | Diff-depth synchronization with REST snapshot |
| Liquidity heatmap | Implemented | Depth snapshots persisted and exposed for historical rendering |
| Strategy marketplace | Planned | Module directories are currently placeholders |
| Token-gated access | Planned | Backend chain verification still required |
| Copy-trading execution | Planned | No order placement or position management is implemented |

## Technology Stack

- **Runtime:** Node.js 20+
- **Language:** JavaScript (ES Modules)
- **HTTP framework:** Fastify 5
- **Database:** SQLite
- **SQLite driver:** better-sqlite3
- **Authentication:** JWT, bcryptjs, Google Auth Library
- **Email:** Nodemailer / SMTP
- **Wallet and chain utilities:** ethers v6, BNB Smart Chain
- **Exchange market data:** Binance USDⓈ-M Futures REST API and WebSocket streams
- **WebSocket client:** ws
- **Security:** @fastify/helmet, @fastify/rate-limit, AES-256-GCM encryption
- **Tests:** Node.js built-in test runner

## Repository Structure

```text
beanance-backend/
├── docs/
│   └── assets/                  # Project logo and documentation images
├── src/
│   ├── app.js                   # Fastify application composition and lifecycle
│   ├── server.js                # Environment loading and HTTP server startup
│   ├── config/
│   │   └── env.js               # Environment validation and configuration
│   ├── db/
│   │   ├── index.js             # SQLite initialization
│   │   ├── migrate.js           # Ordered SQL migration runner
│   │   └── migrations/          # Versioned SQL migrations (001–006)
│   ├── routes/
│   │   ├── index.js             # API module registration
│   │   └── health.js            # Health endpoint
│   └── modules/
│       ├── auth/                # Authentication, email verification
│       ├── wallet/              # BNB Smart Chain wallet management
│       ├── exchanges/           # Binance API credential management
│       ├── market/              # Futures market data, indicators, CVD, liquidity
│       ├── strategies/          # Planned; currently placeholder
│       ├── token-gating/        # Planned; currently placeholder
│       ├── copy-trading/        # Planned; currently placeholder
│       ├── blockchain/          # Planned; currently placeholder
│       ├── users/               # Reserved module area
│       └── shared/              # Reserved shared module area
├── tests/
│   ├── integration/             # API integration tests
│   └── unit/                    # Unit tests
├── storage/                     # Runtime SQLite database (not committed)
├── .env.example
├── package.json
└── README.md
```

### Module conventions

The codebase uses a modular-monolith architecture. Keep domain logic inside its module rather than growing a single global service.

For an established module, the preferred separation is:

- `<domain>.routes.js` — HTTP routes, request validation, response mapping.
- `<domain>.service.js` — business logic and persistence orchestration.
- Supporting services — focused integrations or calculations, such as `indicator.service.js`.
- SQL migrations — schema changes in `src/db/migrations/`.

Register new modules through `src/routes/index.js` and wire shared dependencies through `src/app.js`. Follow the existing module patterns before introducing a new abstraction.

## Getting Started

### Requirements

- Node.js 20 or newer
- npm
- OpenSSL (for generating encryption keys)

### Install

```bash
git clone https://github.com/YosmerryGod/beanance-backend.git
cd beanance-backend
npm install
cp .env.example .env
```

### Configure environment

Update `.env` with real values. Never commit this file.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | No | Runtime mode; defaults to development |
| `HOST` | No | Bind address; example `0.0.0.0` |
| `PORT` | No | HTTP port; example `3000` |
| `DATABASE_PATH` | No | SQLite file path; example `./storage/beanance.sqlite` |
| `JWT_SECRET` | Yes for production | JWT signing secret; use a strong random value of at least 32 characters |
| `GOOGLE_CLIENT_ID` | Optional | Google OAuth Web Client ID |
| `SMTP_HOST` | Required for email delivery | SMTP hostname |
| `SMTP_PORT` | Required for email delivery | SMTP port |
| `SMTP_SECURE` | Required for email delivery | Whether SMTP uses implicit TLS |
| `SMTP_USER` | Required for email delivery | SMTP username |
| `SMTP_PASSWORD` | Required for email delivery | SMTP password |
| `SMTP_FROM` | Required for email delivery | Sender identity |
| `WALLET_ENCRYPTION_KEY` | Yes for production | 32-byte AES-256-GCM key, encoded as 64 hex characters |
| `EXCHANGE_ENCRYPTION_KEY` | Yes for production | Separate 32-byte AES-256-GCM key, encoded as 64 hex characters |

Generate independent encryption keys:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Use the first value for `WALLET_ENCRYPTION_KEY` and the second for `EXCHANGE_ENCRYPTION_KEY`. Do not reuse either key as `JWT_SECRET`. Back up encryption keys securely: losing a key makes the corresponding encrypted credentials unrecoverable.

The development fallback encryption keys are only for local development and must never be used in production.

### Start the server

Development (watch mode):

```bash
npm run dev
```

Production:

```bash
npm start
```

The API listens on the configured host and port. The default local base URL is:

```text
http://localhost:3000
```

### Health check

```bash
curl http://localhost:3000/api/v1/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "beanance-backend"
}
```

### Run tests

```bash
npm test
```

The project uses Node's built-in test runner. Run tests after every backend change, and add or update tests when behavior or API contracts change.

## API Reference

All API routes are versioned under `/api/v1`.

### Health

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | Public | Service health check |

### Authentication and profile

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/api/v1/auth/register` | Public | Start email registration and send verification code |
| POST | `/api/v1/auth/register/verify` | Public | Verify code and create account |
| POST | `/api/v1/auth/login` | Public | Email/password login |
| POST | `/api/v1/auth/google` | Public | Google ID-token login |
| GET | `/api/v1/auth/me` | JWT | Get current user |
| PATCH | `/api/v1/auth/profile` | JWT | Update username and/or avatar URL |
| POST | `/api/v1/auth/password/request-code` | JWT | Request password-change verification code |
| POST | `/api/v1/auth/password/verify-code` | JWT | Verify code and save new password |

Registration uses a six-digit email verification code. Codes expire after 10 minutes and allow at most five incorrect attempts. Passwords are stored as bcrypt hashes. Successful login returns a JWT; send it on protected requests as:

```http
Authorization: Bearer <JWT>
```

Google login requires `GOOGLE_CLIENT_ID`. Email verification and password-change email delivery require valid SMTP configuration.

### Wallets

All wallet routes require JWT authentication.

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/v1/wallets/create` | Generate a BNB Smart Chain wallet |
| POST | `/api/v1/wallets/import` | Import by private key or mnemonic |
| GET | `/api/v1/wallets` | List the current user's wallets |
| GET | `/api/v1/wallets/:walletId` | Read wallet metadata |
| PATCH | `/api/v1/wallets/:walletId/primary` | Set primary wallet |
| DELETE | `/api/v1/wallets/:walletId` | Delete wallet |

Wallet private keys and mnemonic phrases are encrypted at rest using AES-256-GCM. Wallet creation returns the recovery phrase once; protect it and back it up securely. List and detail endpoints return public metadata, not wallet secrets.

**Custody model:** this is a custodial server-side design. The service controls the encryption key and can technically decrypt stored wallet secrets. Treat server access, database files, backups, and environment secrets as critical security assets.

### Exchange accounts

All exchange routes require JWT authentication.

| Method | Endpoint | Description |
| --- | --- | --- |
| POST | `/api/v1/exchanges/binance/connect` | Verify and connect Binance USDⓈ-M Futures credentials |
| GET | `/api/v1/exchanges` | List connected exchange accounts |
| GET | `/api/v1/exchanges/:accountId` | Read connection metadata |
| POST | `/api/v1/exchanges/:accountId/verify` | Re-verify stored credentials |
| DELETE | `/api/v1/exchanges/:accountId` | Disconnect and delete credentials |

Example request:

```json
{
  "apiKey": "YOUR_BINANCE_API_KEY",
  "apiSecret": "YOUR_BINANCE_API_SECRET",
  "label": "Main Futures"
}
```

Credentials are encrypted at rest using the separate `EXCHANGE_ENCRYPTION_KEY`. The current integration signs a read-only request to Binance `GET /fapi/v3/account`. Use an API key with Futures account read access only. Do not enable withdrawals or transfers. The current integration does not place orders, change leverage, or modify positions.

### Market data — Binance USDⓈ-M Futures

Market endpoints are public and do not require JWT authentication. The upstream exchange is Binance USDⓈ-M Futures.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/v1/market/overview` | Market overview, top volume, gainers and losers |
| GET | `/api/v1/market/markets` | Search, sort, and paginate USDT perpetual markets |
| GET | `/api/v1/market/markets/:symbol` | Ticker detail |
| GET | `/api/v1/market/markets/:symbol/klines` | OHLCV candles |
| GET | `/api/v1/market/markets/:symbol/indicators` | Technical indicators |
| GET | `/api/v1/market/markets/:symbol/futures-analytics` | Funding, mark/index price, open interest, ratios and depth analytics |
| GET | `/api/v1/market/markets/:symbol/cvd` | Current trade-flow CVD and recent trades |
| GET | `/api/v1/market/markets/:symbol/order-book` | Synchronized order-book snapshot |
| GET | `/api/v1/market/markets/:symbol/liquidity-heatmap` | Recent liquidity depth snapshots |
| GET | `/api/v1/market/markets/:symbol/cvd/history` | Historical CVD candles |
| GET | `/api/v1/market/markets/:symbol/liquidity-heatmap/history` | Historical liquidity heatmap snapshots |
| GET | `/api/v1/market/liquidity-status` | Per-symbol trade/depth stream diagnostics |
| GET | `/api/v1/market/status` | Market data service status |

#### Common query parameters

**Markets**

- `search` — optional symbol search.
- `sort` — `volume`, `change`, `change_desc`, or `price`.
- `limit` — 1–500; default 100.
- `offset` — pagination offset.

**Klines**

- `interval` — required Binance interval, such as `1m`, `5m`, `1h`, or `1d`.
- `limit` — 1–1500; default 500.

**Indicators**

- `interval` — required candle interval.
- `limit` — 30–1500; default 500.
- Additional indicator period parameters are validated by the route schema. See `src/modules/market/market.routes.js` for the authoritative list and defaults.

**Futures analytics**

- `period` — `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `6h`, `12h`, or `1d`.
- `limit` — 1–500; default 30.

**CVD and liquidity history**

- `range` — `1h`, `4h`, `24h`, or `7d`.
- CVD `interval` — `1m`, `5m`, `15m`, or `1h`.
- Heatmap history `limit` — 1–1000; default 500.

Example requests:

```bash
# BTC perpetual candles
curl "http://localhost:3000/api/v1/market/markets/BTCUSDT/klines?interval=1m&limit=500"

# BTC indicators
curl "http://localhost:3000/api/v1/market/markets/BTCUSDT/indicators?interval=5m&limit=500"

# Current CVD
curl "http://localhost:3000/api/v1/market/markets/BTCUSDT/cvd?limit=200"

# Historical CVD
curl "http://localhost:3000/api/v1/market/markets/BTCUSDT/cvd/history?range=24h&interval=5m"

# Historical liquidity heatmap
curl "http://localhost:3000/api/v1/market/markets/BTCUSDT/liquidity-heatmap/history?range=24h&limit=500"
```

#### Market-data implementation notes

- The market module maintains a public Binance Futures ticker stream and uses REST endpoints for market snapshots, candles, and derivatives analytics.
- Per-symbol trade-flow and depth sessions are created on demand when a symbol is requested. The liquidity module consumes Binance aggregate trades and diff-depth events.
- Aggressor-side trade volume is inferred from Binance aggregate-trade buyer-is-maker metadata. CVD is based on observed aggregate trades, not candle direction.
- Order-book depth is synchronized using a REST snapshot and Binance diff-depth updates. Consumers should treat the order book as unavailable until synchronization has completed.
- Liquidity depth snapshots are sampled and persisted in SQLite. Historical CVD and heatmap data are based on data collected by this service; they are **not a complete historical Binance backfill**.
- Historical market data availability therefore grows while the service is running and symbols are being collected. A newly requested symbol may not have a populated history immediately.
- The current cleanup policy retains market trade and liquidity snapshot history for up to seven days.
- The estimated candle-derived volume delta in the indicator module is distinct from trade-level CVD. Do not label them as the same data source.

For exact response shapes, validation rules, and implementation behavior, inspect the route and service files rather than assuming this README captures every field.

## Database and migrations

SQLite is initialized in `src/db/index.js`. The database uses:

- Write-Ahead Logging (WAL).
- Foreign-key enforcement.
- A 5-second busy timeout.
- Automatic ordered migrations at application startup.
- Migration tracking in `schema_migrations`.

Current migration sequence:

| Migration | Purpose |
| --- | --- |
| `001_create_users.sql` | User records |
| `002_create_email_verification_codes.sql` | Email verification and password-change codes |
| `003_create_wallets.sql` | Wallet metadata and encrypted secret storage |
| `004_add_wallet_chain_id.sql` | Wallet chain identifier |
| `005_create_exchange_accounts.sql` | Encrypted exchange credential records |
| `006_create_market_history.sql` | Persisted aggregate trades, CVD state, and liquidity snapshots |

### Migration rules

1. Never edit a migration that has already been applied in a deployed environment.
2. Add a new sequential SQL migration for schema changes.
3. Keep migrations deterministic and safe to apply once.
4. Preserve existing user data; do not drop or rebuild production tables casually.
5. Verify the migration runner and test database behavior before deployment.
6. Back up the SQLite database before production schema changes.

Do not commit runtime database files or production database backups.

## Architecture and runtime lifecycle

The application is composed in `src/app.js`:

1. Load and validate environment configuration.
2. Initialize SQLite and apply pending migrations.
3. Construct domain services and decorate Fastify with shared dependencies.
4. Register security plugins and API routes.
5. Start the market service when Fastify becomes ready.
6. Stop market WebSocket sessions and close the database during shutdown.

The HTTP server entry point is `src/server.js`. Route registration is centralized in `src/routes/index.js`.

The market service is intentionally separate from user-specific exchange credential connections. Public market data must not depend on a user connecting their personal Binance API key.

## Security Requirements

These requirements apply to every contributor and AI coding agent working in this repository:

- Never commit `.env`, API keys, SMTP passwords, JWT secrets, private keys, mnemonic phrases, or production database files.
- Never log authentication secrets, wallet import payloads, recovery phrases, exchange API secrets, or decrypted credentials.
- Keep wallet and exchange encryption keys separate.
- Validate and authorize every user-owned resource against the authenticated user ID. Never trust a client-supplied owner ID.
- Keep strategy access checks and token-balance verification on the backend.
- Use least-privilege exchange API permissions. Withdrawals and transfers must not be enabled for copy-trading credentials.
- Do not implement live order execution without explicit order validation, position sizing limits, user risk controls, idempotency, error recovery, and audit logging.
- Treat WebSocket reconnects, stale data, upstream rate limits, and partial synchronization as normal failure modes.
- Do not represent backtested performance as live results or guarantee trading profits.

## Development Workflow

Before changing code:

1. Read the relevant route, service, database, and test files.
2. Check how the module is registered and how dependencies are injected.
3. Confirm the actual API response shape and existing validation behavior.
4. Identify backward-compatibility and data-migration implications.
5. Make the smallest change that solves the requested task.

After changing code:

1. Run `npm test`.
2. Add tests for new behavior and regression cases.
3. Verify API paths, request schemas, response shapes, and error behavior.
4. Review logs and ensure no secrets or sensitive payloads are exposed.
5. Update this README if endpoints, configuration, architecture, or implementation status changed.

Do not claim tests, deployments, or exchange operations succeeded unless they were actually executed and verified.

## AI Agent Handoff / Working Instructions

This section is intended for another AI assistant or developer continuing the project.

### Read these files first

| File | Why it matters |
| --- | --- |
| `package.json` | Runtime version, dependencies, scripts |
| `src/app.js` | Service construction, dependency injection, lifecycle hooks |
| `src/server.js` | Server startup and shutdown |
| `src/config/env.js` | Required environment variables and validation |
| `src/routes/index.js` | API module registration and URL prefixes |
| `src/db/index.js` | SQLite initialization and migration startup |
| `src/db/migrate.js` | Migration execution behavior |
| `src/modules/auth/` | Authentication and email verification patterns |
| `src/modules/wallet/` | Encryption and custodial wallet behavior |
| `src/modules/exchanges/` | Signed Binance account verification |
| `src/modules/market/market.routes.js` | Market API contract and request schemas |
| `src/modules/market/market.service.js` | Binance market data orchestration |
| `src/modules/market/indicator.service.js` | Technical indicator calculations |
| `src/modules/market/liquidity.service.js` | AggTrade, CVD, order book, heatmap, and persistence |
| `src/db/migrations/` | Actual database schema history |
| `tests/` | Existing test conventions and regression coverage |

### Current market-data continuation context

The market-data backend already exposes:

- Binance USDⓈ-M Futures market overview, symbol list, ticker details, and OHLCV candles.
- Technical indicator calculations.
- Funding, mark/index price, open interest, long/short ratios, and related Futures analytics.
- Live trade-level CVD from aggregate trades.
- A locally synchronized order book.
- Recent and historical liquidity heatmap snapshots.
- Historical CVD aggregation and liquidity diagnostics.

The next natural frontend integration is to connect the Trade/Chart screen to these endpoints:

1. Keep the existing candlestick chart as the primary chart.
2. Render historical liquidity depth as a heatmap overlay behind or alongside price candles, with a clear visibility toggle if needed.
3. Render CVD in a dedicated lower chart panel.
4. Keep selected symbol, timeframe, and visible time range synchronized across candles, CVD, and heatmap.
5. Use the existing live market stream for live updates where the frontend has access to it; use REST history endpoints for initial loading and range changes.
6. Handle empty history, loading states, stale connections, and symbols that have only just started collecting data.
7. Avoid inventing response fields. Inspect the actual service return values and verify the frontend parser against real API responses.

The frontend repository is separate from this backend repository. Do not assume its path, framework, or file structure without inspecting the frontend project supplied by the user.

### Product direction and implementation boundaries

The intended product is a strategy marketplace with token-based access controls and copy trading. However, the current codebase does not yet implement strategy creation, strategy deployment, on-chain access verification, or copy-trading order execution.

When implementing these domains, design them as separate modules and define their database schema, authorization model, API contract, and tests before connecting them to live trading.

### Instructions for AI assistants

When continuing this codebase:

- Treat the checked-out repository as the source of truth. This README is a guide, not a substitute for reading source code.
- Inspect current files and Git history before editing. Do not rely on assumptions from earlier conversations.
- Preserve existing behavior unless the task explicitly requests a change.
- Do not rename, refactor, or remove unrelated modules.
- Do not fabricate completed features, API responses, test results, or deployment status.
- Make database changes through new migrations.
- Explain changed files, API changes, migration impact, and tests performed.
- If a required frontend file, environment value, or product decision is missing, ask for it instead of guessing.

## Roadmap

- [x] Fastify application and SQLite foundation
- [x] Authentication and email verification
- [x] Google ID-token sign-in
- [x] JWT-protected profile management
- [x] BNB Smart Chain wallet management with encrypted secrets
- [x] Binance USDⓈ-M Futures credential connection and read-only verification
- [x] Public Binance Futures market-data service
- [x] Technical indicator API
- [x] Trade-level CVD collection and history
- [x] Order-book synchronization
- [x] Liquidity heatmap collection and history
- [ ] Frontend chart integration for CVD and liquidity heatmap
- [ ] Strategy creation, editing, publishing, and versioning
- [ ] Strategy execution engine and sandbox
- [ ] Strategy performance, backtesting, and risk analytics
- [ ] On-chain token ownership verification
- [ ] Creator-defined token-gated copy-trading access
- [ ] Copy-trading execution, position controls, and audit trail
- [ ] Production hardening, monitoring, and deployment runbook

## Risk Disclaimer

Trading digital assets and derivatives involves substantial risk and can result in the loss of capital. Historical data, indicators, and backtested strategy results do not guarantee future performance. Strategy tokens are separate digital assets and must not be presented as guarantees of profit or ownership rights unless explicitly defined by applicable product terms.

## License

No open-source license has been specified. Unless and until a license is added, all rights are reserved by the copyright holder.
