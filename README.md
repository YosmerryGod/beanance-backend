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

The authentication MVP now supports email/password registration and login, Google ID-token sign-in, JWT sessions, and a protected current-user endpoint. Strategy, token-gating, and copy-trading business logic are not implemented yet.

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
| DATABASE_PATH | ./storage/beanance.sqlite | SQLite database file path |

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

The connection enables:

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
| POST | `/register` | Create an email/password account |
| POST | `/login` | Sign in with email/password |
| POST | `/google` | Verify a Google ID token and sign in |
| GET | `/me` | Return the authenticated user's profile |

For Google sign-in, configure `GOOGLE_CLIENT_ID`. The frontend obtains an ID token using Google Identity Services and sends it to `POST /api/v1/auth/google` as `{ "idToken": "..." }`. The backend verifies the token, its audience, and the Google account's verified email.

Email registration accepts an email and a password of at least 8 characters. The backend generates a random username and stores the password as a bcrypt hash. Password hashes are never returned by the API.

Successful authentication returns a JWT that expires after 7 days. Protected requests must include `Authorization: Bearer <jwt>`. Set a strong random `JWT_SECRET` with at least 32 characters before deployment. Google sign-in remains disabled until `GOOGLE_CLIENT_ID` is configured.

## Profile Management API

All profile-management endpoints require a valid JWT in the `Authorization: Bearer <jwt>` header.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/v1/auth/me` | Read the current profile |
| PATCH | `/api/v1/auth/profile` | Update username and/or avatar URL |
| PUT | `/api/v1/auth/password` | Create or change account password |

Profile updates accept `username` (3–20 letters, numbers, or underscores) and `avatarUrl` (an absolute URL or `null` to clear the photo). Usernames must be unique.

Password updates accept `newPassword` (at least 8 characters). Email/password accounts must also provide `currentPassword`. Google-only accounts can create a password without a current password; after doing so, the account is marked as supporting both Google and password sign-in. Passwords are stored as bcrypt hashes.

## Risk Disclaimer

Trading digital assets involves substantial risk and can result in the loss of capital. Backtested or historical strategy performance does not guarantee future results. Strategy tokens are separate digital assets and should not be represented as guarantees of profit.

## License

No license has been specified yet. All rights are reserved by the copyright holder until a license is added.
