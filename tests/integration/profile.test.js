import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";

async function createTestApp() {
  return buildApp({
    nodeEnv: "test",
    databasePath: ":memory:",
    jwtSecret: "test-secret-with-at-least-thirty-two-characters",
    googleClientId: ""
  });
}

async function registerUser(app, email) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, password: "initial-password-123" }
  });

  assert.equal(response.statusCode, 201);
  return response.json();
}

test("authenticated user can update username and avatar", async (t) => {
  const app = await createTestApp();
  t.after(() => app.close());

  const account = await registerUser(app, "profile@example.com");
  const response = await app.inject({
    method: "PATCH",
    url: "/api/v1/auth/profile",
    headers: { authorization: `Bearer ${account.token}` },
    payload: {
      username: "Beanance_User",
      avatarUrl: "https://example.com/avatar.png"
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.username, "Beanance_User");
  assert.equal(response.json().user.avatarUrl, "https://example.com/avatar.png");
});

test("profile update rejects duplicate usernames", async (t) => {
  const app = await createTestApp();
  t.after(() => app.close());

  const first = await registerUser(app, "first@example.com");
  await registerUser(app, "second@example.com");

  const response = await app.inject({
    method: "PATCH",
    url: "/api/v1/auth/profile",
    headers: { authorization: `Bearer ${first.token}` },
    payload: { username: "bean_reserved" }
  });

  assert.equal(response.statusCode, 200);

  const second = app.database.prepare(
    "SELECT id FROM users WHERE email = ?"
  ).get("second@example.com");

  const secondToken = app.jwt.sign({ sub: second.id, email: "second@example.com" });
  const conflict = await app.inject({
    method: "PATCH",
    url: "/api/v1/auth/profile",
    headers: { authorization: `Bearer ${secondToken}` },
    payload: { username: "bean_reserved" }
  });

  assert.equal(conflict.statusCode, 409);
});

test("email user must provide current password to change password", async (t) => {
  const app = await createTestApp();
  t.after(() => app.close());

  const account = await registerUser(app, "password@example.com");

  const rejected = await app.inject({
    method: "PUT",
    url: "/api/v1/auth/password",
    headers: { authorization: `Bearer ${account.token}` },
    payload: { newPassword: "new-password-456" }
  });

  assert.equal(rejected.statusCode, 401);

  const changed = await app.inject({
    method: "PUT",
    url: "/api/v1/auth/password",
    headers: { authorization: `Bearer ${account.token}` },
    payload: {
      currentPassword: "initial-password-123",
      newPassword: "new-password-456"
    }
  });

  assert.equal(changed.statusCode, 200);

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: {
      email: "password@example.com",
      password: "new-password-456"
    }
  });

  assert.equal(login.statusCode, 200);
});

test("profile and password endpoints require authentication", async (t) => {
  const app = await createTestApp();
  t.after(() => app.close());

  const profile = await app.inject({
    method: "PATCH",
    url: "/api/v1/auth/profile",
    payload: { username: "unauthorized" }
  });

  const password = await app.inject({
    method: "PUT",
    url: "/api/v1/auth/password",
    payload: { newPassword: "new-password-456" }
  });

  assert.equal(profile.statusCode, 401);
  assert.equal(password.statusCode, 401);
});
