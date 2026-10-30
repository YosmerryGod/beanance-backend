import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";

test("email registration, login and authenticated profile", async (t) => {
  const app = await buildApp({
    nodeEnv: "test",
    databasePath: ":memory:",
    jwtSecret: "test-secret-with-at-least-thirty-two-characters",
    googleClientId: ""
  });

  t.after(async () => {
    await app.close();
  });

  const registration = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email: "tester@example.com",
      password: "strong-password-123"
    }
  });

  assert.equal(registration.statusCode, 201);
  const registrationBody = registration.json();
  assert.ok(registrationBody.token);
  assert.match(registrationBody.user.username, /^bean_[a-z2-9]{8}$/);
  assert.equal(registrationBody.user.email, "tester@example.com");
  assert.equal(registrationBody.user.avatarUrl, null);
  assert.equal("password_hash" in registrationBody.user, false);

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: "TESTER@example.com",
      password: "strong-password-123"
    }
  });

  assert.equal(login.statusCode, 200);
  assert.ok(login.json().token);

  const profile = await app.inject({
    method: "GET",
    url: "/api/v1/auth/me",
    headers: {
      authorization: `Bearer ${login.json().token}`
    }
  });

  assert.equal(profile.statusCode, 200);
  assert.equal(profile.json().user.email, "tester@example.com");
});

test("login rejects an incorrect password", async (t) => {
  const app = await buildApp({
    nodeEnv: "test",
    databasePath: ":memory:",
    jwtSecret: "test-secret-with-at-least-thirty-two-characters",
    googleClientId: ""
  });

  t.after(async () => {
    await app.close();
  });

  await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: {
      email: "wrongpass@example.com",
      password: "strong-password-123"
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: "wrongpass@example.com",
      password: "incorrect-password"
    }
  });

  assert.equal(response.statusCode, 401);
});
