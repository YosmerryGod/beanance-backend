# Beanance Backend

**The strategy launchpad and marketplace for algorithmic trading.**

Beanance is an early-stage platform for creating, discovering, launching, and using algorithmic trading strategies. Each published strategy may be associated with a tradable strategy token, while token ownership can be used as an access requirement for copy trading.

> **Project status:** MVP foundation. The current repository contains the initial Fastify application scaffold and SQLite connection. Business features are not implemented yet.

## Technology Stack

- **Runtime:** Node.js 20+
- **HTTP framework:** Fastify 5
- **Database:** SQLite
- **SQLite driver:** better-sqlite3
- **Configuration:** dotenv
- **Security middleware:** @fastify/helmet and @fastify/rate-limit
- **Testing:** Node.js built-in test runner

## MVP Architecture

The backend uses a modular monolith. The application runs as one Node.js service, with code organized by responsibility so individual domains can evolve without introducing microservices prematurely.

```text
beanance-backend/
├── src/
│   ├── app.js
│   ├── server.js
│   ├── config/
│   │   └── env.js
│   ├── db/
│   │   ├── index.js
│   │   └── migrations/
│   ├── routes/
│   │   ├── index.js
│   │   └── health.js
│   ├── modules/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── strategies/
│   │   ├── token-gating/
│   │   ├── copy-trading/
│   │   ├── blockchain/
│   │   └── shared/
│   ├── middleware/
│   ├── plugins/
│   └── types/
├── tests/
│   ├── unit/
│   └── integration/
├── docs/
├── storage/
├── .env.example
├── .gitignore
└── package.json
```

The MVP supports email/password registration and login, Google ID-token sign-in, JWT sessions, protected profile management, custodial BNB Smart Chain wallets, and Binance USDⓈ-M Futures account connections. Strategy and copy-trading execution logic are not implemented yet.

## Getting Started

### Requirements

- Node.js 20 or newer
- npm

### Installation

```bash
git clone https://github.com/YosmerryGod/beanance-backend.git
cd beanance-backend
npm install
```

### Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Available variables:

| Variable | Default | Description |
| --- | --- | --- |
| NODE_ENV | development | Runtime environment |
| HOST | 0.0.0.0 | Server bind address |
| PORT | 3000 | HTTP port |
| DATABASE_PATH | ./storage/beanance.sqlite | SQLite database file path |\n| WALLET_ENCRYPTION_KEY | Required in production | 32-byte AES-256-GCM key for wallet secrets |\n| EXCHANGE_ENCRYPTION_KEY | Required in production | Separate 32-byte AES-256-GCM key for exchange API credentials |

The storage directory is created automatically when the database is initialized. SQLite database files are excluded from Git.

### Run the Server

Development mode:

```bash
npm run dev
```

Production mode:

```bash
npm start
```

### Health Check

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

### Run Tests

```bash
npm test
```

## Database

SQLite is used for the MVP to keep local development and deployment straightforward. The database connection is initialized in `src/db/index.js`.

Generate a wallet encryption key with `openssl rand -hex 32`. Keep it outside source control and back it up securely. Losing this key makes stored wallet secrets permanently unrecoverable. Never reuse the JWT secret as the wallet encryption key.\n\nThe connection enables:

- Write-Ahead Logging (WAL) mode.
- Foreign-key enforcement.
- A configurable busy timeout.

Database migrations are applied automatically at startup and tracked in `schema_migrations`. The initial migration creates the `users` table. Do not store production database files in the repository.

## Product Direction

Beanance is planned around two connected products:

1. **Strategy Token Marketplace** — creators can publish strategies and associate them with strategy tokens.
2. **Token-Gated Copy Trading** — each creator can configure the minimum token balance required to access copy trading for their strategy.

A strategy's token requirement must be verified by the backend against the relevant chain and token contract. Frontend-only balance checks are not sufficient.

Owning a strategy token does not automatically imply ownership of the strategy, a right to profits, or entitlement to revenue sharing. Those rights require separate, explicit product terms.

## Security Principles

- Keep authorization checks on the backend.
- Never trust token balances supplied by the client.
- Never request exchange withdrawal permissions for copy-trading integrations.
- Encrypt sensitive credentials at rest.
- Never commit secrets, private keys, or database files.
- Define safe behavior for revoked copy-trading access and existing open positions.
- Clearly distinguish backtested performance from live trading results.

## Roadmap

- [x] Initialize Fastify application
- [x] Add SQLite connection layer
- [x] Add versioned health endpoint
- [x] Add initial automated tests
- [ ] Add database migrations
- [x] Implement email verification for registration and password changes
- [x] Implement email/password registration and login
- [x] Add Google ID-token sign-in
- [x] Add JWT authentication and current-user endpoint
- [ ] Implement strategy creation and deployment
- [ ] Add creator-defined minimum token requirements
- [ ] Integrate on-chain token balance verification
- [ ] Implement token-gated copy-trading access
- [ ] Add copy-trading execution and user risk controls
- [ ] Add strategy performance and risk analytics

## Authentication API

Base path: `/api/v1/auth`

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/register` | Start email registration and send a verification code |
| POST | `/register/verify` | Verify the code and create the account |
| POST | `/login` | Sign in with email/password |
| POST | `/google` | Verify a Google ID token and sign in |
| GET | `/me` | Return the authenticated user's profile |

For Google sign-in, configure `GOOGLE_CLIENT_ID`. The frontend obtains an ID token using Google Identity Services and sends it to `POST /api/v1/auth/google` as `{ "idToken": "..." }`. The backend verifies the token, its audience, and the Google account's verified email.

Email registration is a two-step process. `POST /register` sends a six-digit code to the supplied email. `POST /register/verify` completes registration only after the code is verified. Codes expire after 10 minutes and allow at most five incorrect attempts. The backend generates a random username and stores the password as a bcrypt hash. Password hashes and verification-code hashes are never returned by the API.

Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` to enable email delivery. Email registration and password changes return a service-unavailable error until SMTP is configured.

Successful authentication returns a JWT that expires after 7 days. Protected requests must include `Authorization: Bearer <jwt>`. Set a strong random `JWT_SECRET` with at least 32 characters before deployment. Google sign-in remains disabled until `GOOGLE_CLIENT_ID` is configured.

## Profile Management API

All profile-management endpoints require a valid JWT in the `Authorization: Bearer <jwt>` header.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/v1/auth/me` | Read the current profile |
| PATCH | `/api/v1/auth/profile` | Update username and/or avatar URL |
| POST | `/api/v1/auth/password/request-code` | Request an email verification code |
| POST | `/api/v1/auth/password/verify-code` | Confirm code and save the new password |

Profile updates accept `username` (3–20 letters, numbers, or underscores) and `avatarUrl` (an absolute URL or `null` to clear the photo). Usernames must be unique.

Password changes require two steps. First call `/password/request-code` with `newPassword`; email/password accounts must also provide `currentPassword`. A six-digit code is sent to the account email. Then call `/password/verify-code` with the code to commit the change. Google-only accounts can create a password without a current password, but must verify the email code. After creating a password, the account supports both Google and password sign-in. Codes expire after 10 minutes and allow at most five incorrect attempts. Passwords are stored as bcrypt hashes.

## Risk Disclaimer

Trading digital assets involves substantial risk and can result in the loss of capital. Backtested or historical strategy performance does not guarantee future results. Strategy tokens are separate digital assets and should not be represented as guarantees of profit.

## License

No license has been specified yet. All rights are reserved by the copyright holder until a license is added.


## Custodial BNB Smart Chain Wallet API

All wallet endpoints require a valid JWT. Each account can own multiple wallets, with exactly one primary wallet when at least one wallet exists. Wallet records are scoped to the authenticated user.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/v1/wallets/create` | Generate a new BSC wallet |
| POST | `/api/v1/wallets/import` | Import using a private key or mnemonic phrase |
| GET | `/api/v1/wallets` | List the current user's wallets |
| GET | `/api/v1/wallets/:walletId` | Read wallet metadata |
| PATCH | `/api/v1/wallets/:walletId/primary` | Set the primary wallet |
| DELETE | `/api/v1/wallets/:walletId` | Delete a wallet |

The wallet API uses ethers v6 and BNB Smart Chain mainnet (chain ID 56). Private keys and available mnemonic phrases are encrypted at rest with AES-256-GCM. The encryption key is supplied through `WALLET_ENCRYPTION_KEY`; it must be a 32-byte key represented by 64 hexadecimal characters. The development fallback key is for local development only and must never be used in production.

The create endpoint returns the newly generated recovery phrase once so the user can back it up. Import endpoints never return the submitted private key or mnemonic. Standard wallet listing and detail endpoints return public metadata only. A dedicated, re-authenticated secret-export flow should be implemented before offering users the ability to reveal stored secrets later.

**Custodial security note:** Beanance controls the server-side encryption key and can technically access user wallet keys. Protect the server, database backups, environment secrets, and deployment access accordingly. Do not log request bodies for wallet import or wallet creation responses.


## Binance USDⓈ-M Futures Connection API

All exchange endpoints require a valid JWT. A user can connect one or more Binance Futures API credentials to their Beanance account.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/v1/exchanges/binance/connect` | Verify and connect Binance USDⓈ-M Futures |
| GET | `/api/v1/exchanges` | List connected exchange accounts |
| GET | `/api/v1/exchanges/:accountId` | Read connection metadata |
| POST | `/api/v1/exchanges/:accountId/verify` | Re-verify saved credentials |
| DELETE | `/api/v1/exchanges/:accountId` | Disconnect and delete saved credentials |

Connect request body:

```json
{
  "apiKey": "YOUR_BINANCE_API_KEY",
  "apiSecret": "YOUR_BINANCE_API_SECRET",
  "label": "Main Futures"
}
```

The backend signs a read-only account request to Binance `GET /fapi/v3/account` using HMAC-SHA256 and a short `recvWindow`. Credentials are encrypted with AES-256-GCM before storage. API keys and secrets are never returned by the API.

Generate a separate encryption key using `openssl rand -hex 32` and set it as `EXCHANGE_ENCRYPTION_KEY`. Do not reuse `WALLET_ENCRYPTION_KEY` or `JWT_SECRET`. Back up this key securely; losing it makes stored exchange credentials unrecoverable.

For the initial connection, create a Binance API key with Futures account read access. Do not enable withdrawals or transfers. The connection check proves that Beanance can read the USDⓈ-M Futures account; it does not prove that order/trading permission is enabled. Trading permission checks and copy-trading order execution will be implemented separately. Use IP restrictions on the Binance API key where possible.

The current integration uses Binance production Futures REST API only. It does not place orders, change leverage, or modify positions.
