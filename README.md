# Beanance Backend

**The strategy launchpad and marketplace for algorithmic trading.**

Beanance is a platform for creating, discovering, launching, and using algorithmic trading strategies. Each published strategy can have its own tradable strategy token, while token ownership can be used as an access requirement for copy trading.

> **Project status:** Early development. Features described as planned are product direction, not a claim that they are already implemented.

## Overview

Beanance connects strategy creators with traders through two complementary products:

1. **Strategy Token Marketplace** — eligible strategies can be launched with their own token and traded by the community.
2. **Token-Gated Copy Trading** — creators define the minimum number of their strategy tokens a user must hold to unlock copy trading.

The goal is to help creators publish and build an audience around their strategies, while giving users transparent information to evaluate them.

## Core Concepts

### Strategy

A strategy is a published trading system with its own identity and configuration. A strategy profile is intended to include:

- Name, description, creator, and supported markets.
- Trading logic or execution configuration.
- Backtest and live performance information, where available.
- Risk metrics and execution status.
- Associated strategy token, if launched.
- Copy-trading eligibility requirements.

### Strategy Token

A strategy may be associated with a dedicated token. The token can be traded independently from the strategy's execution service.

Token price, market capitalization, liquidity, and trading activity are market data. They must not be presented as proof of strategy quality or future profitability.

### Token-Gated Copy Trading

When publishing or deploying a strategy, its creator configures the minimum token balance required to access copy trading.

| Configuration | Example |
| --- | --- |
| Strategy | BTC Scalper |
| Token | $SCALPER |
| Minimum holding | 100 SCALPER |
| Access condition | Wallet holds at least 100 tokens |

The minimum is configured per strategy by its creator. Beanance should verify token ownership on the relevant chain and enforce the requirement on the server side. Frontend-only checks are not sufficient.

The final access policy—including what happens when a user's balance falls below the requirement, how often balances are rechecked, and how open positions are handled—must be defined before production.

## Product Modules

| Module | Purpose |
| --- | --- |
| Authentication & Accounts | User identity, sessions, and account security |
| Strategy Management | Create, configure, update, and publish strategies |
| Strategy Discovery | Browse, search, and evaluate published strategies |
| Strategy Token Integration | Associate strategies with token and market information |
| Copy Trading Access | Verify token-holding requirements for strategy access |
| Copy Trading Execution | Manage user subscriptions, allocations, and execution lifecycle |
| Performance & Analytics | Present backtests, live results, and risk metrics |
| Creator Tools | Manage published strategies and access requirements |

> This list describes the intended product scope. Refer to the source code and API documentation for currently implemented functionality.

## High-Level Workflow

1. A creator builds and configures a trading strategy.
2. The creator tests the strategy and reviews its risk and performance data.
3. The creator publishes the strategy and, where supported, associates a strategy token.
4. During deployment, the creator sets the minimum token balance required for copy trading.
5. A user acquires the required strategy tokens.
6. Beanance verifies the user's token balance and grants or denies copy-trading access.
7. If access is granted, the user configures their allocation and risk limits before enabling execution.

## Design Principles

- **Creator-defined access:** each strategy creator sets the minimum token requirement for their strategy.
- **Verifiable ownership:** token-gated permissions must be based on verifiable wallet balances.
- **Clear separation:** owning a strategy token does not automatically mean owning the strategy, receiving its profits, or having unrestricted execution access.
- **Transparent performance:** backtested and live results must be clearly distinguished, with fees, drawdowns, and relevant risk information disclosed.
- **User-controlled risk:** copy trading should support user-defined allocation and risk limits.
- **Secure execution:** exchange credentials and signing permissions must be protected and scoped to the minimum required permissions.

## Architecture

The backend is intended to serve as the platform's API and coordination layer for:

- User accounts and authentication.
- Strategy metadata and creator configuration.
- Strategy publication and lifecycle management.
- Token ownership verification.
- Copy-trading authorization and execution coordination.
- Performance data and analytics.

Blockchain interactions, market data providers, and trading execution services should be isolated behind dedicated service modules or adapters. This keeps the core application independent from a specific chain, exchange, or execution provider.

The exact implementation architecture and technology stack will be documented after they are established in the repository.

## Development Setup

The repository is currently in its initial documentation stage. Installation commands, runtime requirements, environment variables, database setup, migrations, and start scripts will be added once the backend implementation is available.

Clone the repository:

```bash
git clone https://github.com/YosmerryGod/beanance-backend.git
cd beanance-backend
```

## Environment Variables

No environment variable contract has been published yet. Do not assume variable names or credentials. Once application configuration is implemented, document every required variable in an `.env.example` file and describe its purpose here.

Never commit real API keys, private keys, exchange credentials, database passwords, or JWT secrets.

## API Documentation

API routes and request/response examples will be documented as endpoints are implemented. An OpenAPI specification is recommended so frontend developers and integrators can explore the API consistently.

## Security Considerations

Beanance is intended to coordinate access to financial trading functionality. Security must be treated as a core requirement.

- Never request or store users' exchange withdrawal permissions.
- Encrypt sensitive credentials at rest and restrict access to them.
- Keep authorization checks on the backend; never trust client-provided token balances.
- Validate token contract addresses, chain IDs, decimals, and balance responses.
- Protect authentication and sensitive endpoints with rate limits and input validation.
- Record security-relevant actions and changes to creator-defined access requirements.
- Define safe behavior for revoked access and existing open positions.
- Do not expose private keys or secrets in logs, API responses, or error messages.

## Risk Disclaimer

Trading digital assets involves substantial risk and can result in the loss of capital. Strategy performance, including backtested or historical results, does not guarantee future results.

A strategy token is a separate digital asset. Holding it should not be represented as a guarantee of profit, ownership of the creator's strategy, or entitlement to trading revenue unless explicit, legally reviewed terms establish those rights.

Users should understand the risks, fees, execution delays, slippage, and possible losses before enabling copy trading.

## Roadmap

- [ ] Establish backend application structure and technology stack
- [ ] Implement authentication and user accounts
- [ ] Implement strategy creation and management
- [ ] Implement strategy deployment configuration
- [ ] Add creator-defined minimum token requirements
- [ ] Integrate on-chain token balance verification
- [ ] Implement token-gated copy-trading authorization
- [ ] Implement user allocation and risk controls
- [ ] Add strategy performance and risk analytics
- [ ] Publish API documentation
- [ ] Add automated tests and production deployment documentation

Roadmap items are subject to change as the project develops.

## Contributing

Contribution guidelines will be added when the development workflow is established. For substantial changes, open an issue first to discuss the proposed implementation.

## License

No license has been specified yet. Until a license is added to this repository, all rights are reserved by the copyright holder.
