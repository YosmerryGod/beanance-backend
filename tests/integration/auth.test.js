import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";

test("email registration requires a verification code before creating account", async (t) => {
  let sentCode;
  const app = await buildApp({
    nodeEnv: "test",
    databasePath: ":memory:",
    jwtSecret: "test-secret-with-at-least-thirty-two-characters",
    googleClientId: "",
    emailSender: async ({ code }) => { sentCode = code; }
  });

  t.after(() => app.close());

  const registration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: "tester@example.com", password: "strong-password-123" }
  });

  assert.equal(registration.statusCode, 202);
  assert.equal(app.database.prepare("SELECT COUNT(*) AS count FROM users").get().count, 0);
  assert.match(sentCode, /^[0-9]{6}$/);

  const verified = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register/verify",
    payload: { email: "tester@example.com", code: sentCode }
  });

  assert.equal(verified.statusCode, 200);
  assert.ok(verified.json().token);
  assert.match(verified.json().user.username, /^bean_[a-z2-9]{8}$/);
  assert.equal(verified.json().user.email, "tester@example.com");

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "TESTER@example.com", password: "strong-password-123" }
  });

  assert.equal(login.statusCode, 200);
  assert.ok(login.json().token);
});

test("registration rejects an incorrect verification code", async (t) => {
  const app = await buildApp({
    nodeEnv: "test",
    databasePath: ":memory:",
    jwtSecret: "test-secret-with-at-least-thirty-two-characters",
    googleClientId: "",
    emailSender: async () => {}
  });

  t.after(() => app.close());

  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: "invalidcode@example.com", password: "strong-password-123" }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register/verify",
    payload: { email: "invalidcode@example.com", code: "000000" }
  });

  assert.equal(response.statusCode, 400);
});

test("login rejects an incorrect password", async (t) => {
  let sentCode;
  const app = await buildApp({
    nodeEnv: "test",
    databasePath: ":memory:",
    jwtSecret: "test-secret-with-at-least-thirty-two-characters",
    googleClientId: "",
    emailSender: async ({ code }) => { sentCode = code; }
  });

  t.after(() => app.close());

  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email: "wrongpass@example.com", password: "strong-password-123" }
  });
  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register/verify",
    payload: { email: "wrongpass@example.com", code: sentCode }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "wrongpass@example.com", password: "incorrect-password" }
  });

  assert.equal(response.statusCode, 401);
});
