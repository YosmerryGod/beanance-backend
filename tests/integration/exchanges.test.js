import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";

test("exchange endpoints require authentication", async (t) => {
  const app = await buildApp({
    nodeEnv: "test",
    databasePath: ":memory:",
    jwtSecret: "test-secret-with-at-least-thirty-two-characters",
    googleClientId: ""
  });

  t.after(() => app.close());

  const list = await app.inject({
    method: "GET",
    url: "/api/v1/exchanges"
  });

  const connect = await app.inject({
    method: "POST",
    url: "/api/v1/exchanges/binance/connect",
    payload: {
      apiKey: "a".repeat(64),
      apiSecret: "b".repeat(64)
    }
  });

  assert.equal(list.statusCode, 401);
  assert.equal(connect.statusCode, 401);
});

test("authenticated user can list exchange accounts without exposing credentials", async (t) => {
  const app = await buildApp({
    nodeEnv: "test",
    databasePath: ":memory:",
    jwtSecret: "test-secret-with-at-least-thirty-two-characters",
    googleClientId: ""
  });

  t.after(() => app.close());

  const userId = "exchange-test-user";
  app.database.prepare(`
    INSERT INTO users (id, username, email, auth_provider)
    VALUES (?, ?, ?, 'email')
  `).run(userId, "exchange_test", "exchange-test@example.com");

  const token = app.jwt.sign({ sub: userId, email: "exchange-test@example.com" });
  const response = await app.inject({
    method: "GET",
    url: "/api/v1/exchanges",
    headers: { authorization: `Bearer ${token}` }
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { exchangeAccounts: [] });
  assert.equal(JSON.stringify(response.json()).includes("apiSecret"), false);
});
