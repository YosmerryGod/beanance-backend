import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";

async function createTestApp() {
  let sentCode;
  const app = await buildApp({
    nodeEnv: "test",
    databasePath: ":memory:",
    jwtSecret: "test-secret-with-at-least-thirty-two-characters",
    googleClientId: "",
    emailSender: async ({ code }) => { sentCode = code; }
  });
  return { app, getCode: () => sentCode };
}

async function registerUser(app, getCode, email) {
  const pending = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    payload: { email, password: "initial-password-123" }
  });
  assert.equal(pending.statusCode, 202);

  const verified = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register/verify",
    payload: { email, code: getCode() }
  });
  assert.equal(verified.statusCode, 200);
  return verified.json();
}

test("authenticated user can update username and avatar", async (t) => {
  const { app, getCode } = await createTestApp();
  t.after(() => app.close());

  const account = await registerUser(app, getCode, "profile@example.com");
  const response = await app.inject({
    method: "PATCH",
    url: "/api/v1/auth/profile",
    headers: { authorization: `Bearer ${account.token}` },
    payload: { username: "Beanance_User", avatarUrl: "https://example.com/avatar.png" }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.json().user.username, "Beanance_User");
  assert.equal(response.json().user.avatarUrl, "https://example.com/avatar.png");
});

test("email password change requires email code after current password", async (t) => {
  const { app, getCode } = await createTestApp();
  t.after(() => app.close());

  const account = await registerUser(app, getCode, "password@example.com");

  const request = await app.inject({
    method: "POST",
    url: "/api/v1/auth/password/request-code",
    headers: { authorization: `Bearer ${account.token}` },
    payload: {
      currentPassword: "initial-password-123",
      newPassword: "new-password-456"
    }
  });

  assert.equal(request.statusCode, 200);

  const verified = await app.inject({
    method: "POST",
    url: "/api/v1/auth/password/verify-code",
    headers: { authorization: `Bearer ${account.token}` },
    payload: { code: getCode() }
  });

  assert.equal(verified.statusCode, 200);

  const login = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email: "password@example.com", password: "new-password-456" }
  });
  assert.equal(login.statusCode, 200);
});

test("profile and password endpoints require authentication", async (t) => {
  const { app } = await createTestApp();
  t.after(() => app.close());

  const profile = await app.inject({
    method: "PATCH",
    url: "/api/v1/auth/profile",
    payload: { username: "unauthorized" }
  });
  const password = await app.inject({
    method: "POST",
    url: "/api/v1/auth/password/request-code",
    payload: { newPassword: "new-password-456" }
  });

  assert.equal(profile.statusCode, 401);
  assert.equal(password.statusCode, 401);
});
