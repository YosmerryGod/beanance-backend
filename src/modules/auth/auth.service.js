import { randomUUID, randomBytes, randomInt, createHmac } from "node:crypto";
import bcrypt from "bcryptjs";

const USERNAME_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;

function randomUsername() {
  const bytes = randomBytes(8);
  let suffix = "";

  for (const byte of bytes) {
    suffix += USERNAME_ALPHABET[byte % USERNAME_ALPHABET.length];
  }

  return `bean_${suffix}`;
}

function hashCode(code, secret) {
  return createHmac("sha256", secret).update(code).digest("hex");
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    avatarUrl: user.avatar_url,
    authProvider: user.auth_provider,
    createdAt: user.created_at
  };
}

export function createAuthService(
  database,
  googleClient,
  googleClientId,
  sendVerificationEmail,
  verificationSecret
) {
  const findByEmail = database.prepare(
    "SELECT * FROM users WHERE email = ? COLLATE NOCASE"
  );
  const findByGoogleId = database.prepare(
    "SELECT * FROM users WHERE google_id = ?"
  );
  const insertUser = database.prepare(`
    INSERT INTO users (
      id, username, email, avatar_url, password_hash, google_id, auth_provider
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  function createUniqueUsername() {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const username = randomUsername();
      const exists = database.prepare(
        "SELECT 1 FROM users WHERE username = ?"
      ).get(username);

      if (!exists) return username;
    }

    throw new Error("Could not generate a unique username.");
  }

  function issueToken(fastify, user) {
    return fastify.jwt.sign(
      { sub: user.id, email: user.email },
      { expiresIn: "7d" }
    );
  }

  function requireEmailDelivery() {
    if (!sendVerificationEmail) {
      const error = new Error("Email delivery is not configured.");
      error.statusCode = 503;
      throw error;
    }
  }

  async function createVerification({ email, purpose, userId = null, passwordHash = null }) {
    requireEmailDelivery();

    const code = String(randomInt(100000, 1000000));
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

    database.prepare(`
      DELETE FROM email_verification_codes
      WHERE email = ? COLLATE NOCASE AND purpose = ?
    `).run(email, purpose);

    database.prepare(`
      INSERT INTO email_verification_codes (
        id, user_id, email, purpose, password_hash, code_hash, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, email, purpose, passwordHash, hashCode(code, verificationSecret), expiresAt);

    try {
      await sendVerificationEmail({ to: email, code, purpose });
    } catch (error) {
      database.prepare("DELETE FROM email_verification_codes WHERE id = ?").run(id);
      throw error;
    }
  }

  function consumeVerification({ email, purpose, code, userId = null }) {
    const record = userId
      ? database.prepare(`
          SELECT * FROM email_verification_codes
          WHERE user_id = ? AND purpose = ?
          ORDER BY created_at DESC LIMIT 1
        `).get(userId, purpose)
      : database.prepare(`
          SELECT * FROM email_verification_codes
          WHERE email = ? COLLATE NOCASE AND purpose = ?
          ORDER BY created_at DESC LIMIT 1
        `).get(email, purpose);

    if (!record) {
      const error = new Error("Verification code is invalid or expired.");
      error.statusCode = 400;
      throw error;
    }

    if (new Date(record.expires_at).getTime() <= Date.now()) {
      database.prepare("DELETE FROM email_verification_codes WHERE id = ?").run(record.id);
      const error = new Error("Verification code has expired.");
      error.statusCode = 400;
      throw error;
    }

    if (record.attempts >= MAX_CODE_ATTEMPTS) {
      database.prepare("DELETE FROM email_verification_codes WHERE id = ?").run(record.id);
      const error = new Error("Too many incorrect verification attempts.");
      error.statusCode = 429;
      throw error;
    }

    const submittedHash = hashCode(code, verificationSecret);
    if (submittedHash !== record.code_hash) {
      database.prepare(
        "UPDATE email_verification_codes SET attempts = attempts + 1 WHERE id = ?"
      ).run(record.id);
      const error = new Error("Verification code is incorrect.");
      error.statusCode = 400;
      throw error;
    }

    database.prepare("DELETE FROM email_verification_codes WHERE id = ?").run(record.id);
    return record;
  }

  async function register({ email, password }) {
    const normalizedEmail = email.trim().toLowerCase();

    if (findByEmail.get(normalizedEmail)) {
      const error = new Error("An account with this email already exists.");
      error.statusCode = 409;
      throw error;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await createVerification({
      email: normalizedEmail,
      purpose: "register",
      passwordHash
    });

    return {
      message: "Verification code sent. Check your email to complete registration.",
      email: normalizedEmail,
      expiresInSeconds: CODE_TTL_MINUTES * 60
    };
  }

  async function verifyRegistration(fastify, { email, code }) {
    const normalizedEmail = email.trim().toLowerCase();

    if (findByEmail.get(normalizedEmail)) {
      const error = new Error("An account with this email already exists.");
      error.statusCode = 409;
      throw error;
    }

    const verification = consumeVerification({
      email: normalizedEmail,
      purpose: "register",
      code
    });

    const user = {
      id: randomUUID(),
      username: createUniqueUsername(),
      email: normalizedEmail,
      avatar_url: null,
      password_hash: verification.password_hash,
      google_id: null,
      auth_provider: "email"
    };

    insertUser.run(
      user.id,
      user.username,
      user.email,
      user.avatar_url,
      user.password_hash,
      user.google_id,
      user.auth_provider
    );

    const savedUser = database.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    return { user: publicUser(savedUser), token: issueToken(fastify, savedUser) };
  }

  async function login(fastify, { email, password }) {
    const user = findByEmail.get(email.trim().toLowerCase());

    if (!user || !user.password_hash || !(await bcrypt.compare(password, user.password_hash))) {
      const error = new Error("Invalid email or password.");
      error.statusCode = 401;
      throw error;
    }

    return { user: publicUser(user), token: issueToken(fastify, user) };
  }

  async function loginWithGoogle(fastify, idToken) {
    if (!googleClientId) {
      const error = new Error("Google sign-in is not configured.");
      error.statusCode = 503;
      throw error;
    }

    let payload;

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: googleClientId
      });
      payload = ticket.getPayload();
    } catch {
      const error = new Error("Invalid Google credential.");
      error.statusCode = 401;
      throw error;
    }

    if (!payload?.sub || !payload.email || payload.email_verified !== true) {
      const error = new Error("Google account email must be verified.");
      error.statusCode = 401;
      throw error;
    }

    let user = findByGoogleId.get(payload.sub);

    if (!user) {
      const existingEmailUser = findByEmail.get(payload.email.toLowerCase());

      if (existingEmailUser) {
        const error = new Error(
          "An account with this email already exists. Sign in with email first."
        );
        error.statusCode = 409;
        throw error;
      }

      user = {
        id: randomUUID(),
        username: createUniqueUsername(),
        email: payload.email.toLowerCase(),
        avatar_url: payload.picture || null,
        password_hash: null,
        google_id: payload.sub,
        auth_provider: "google"
      };

      insertUser.run(
        user.id,
        user.username,
        user.email,
        user.avatar_url,
        user.password_hash,
        user.google_id,
        user.auth_provider
      );
      user = database.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    } else if (payload.picture && payload.picture !== user.avatar_url) {
      database.prepare(
        "UPDATE users SET avatar_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).run(payload.picture, user.id);
      user.avatar_url = payload.picture;
    }

    return { user: publicUser(user), token: issueToken(fastify, user) };
  }

  function getUserOrThrow(userId) {
    const user = database.prepare(
      "SELECT * FROM users WHERE id = ?"
    ).get(userId);

    if (!user) {
      const error = new Error("User not found.");
      error.statusCode = 404;
      throw error;
    }

    return user;
  }

  function getProfile(userId) {
    return publicUser(getUserOrThrow(userId));
  }

  function updateProfile(userId, { username, avatarUrl }) {
    const user = getUserOrThrow(userId);

    if (username !== undefined) {
      const normalizedUsername = username.trim();

      if (normalizedUsername.toLowerCase() !== user.username.toLowerCase()) {
        const existing = database.prepare(
          "SELECT id FROM users WHERE username = ? COLLATE NOCASE AND id != ?"
        ).get(normalizedUsername, userId);

        if (existing) {
          const error = new Error("This username is already taken.");
          error.statusCode = 409;
          throw error;
        }
      }

      user.username = normalizedUsername;
    }

    if (avatarUrl !== undefined) {
      user.avatar_url = avatarUrl;
    }

    try {
      database.prepare(`
        UPDATE users
        SET username = ?, avatar_url = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(user.username, user.avatar_url, userId);
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        const conflict = new Error("This username is already taken.");
        conflict.statusCode = 409;
        throw conflict;
      }
      throw error;
    }

    return getProfile(userId);
  }

  async function requestPasswordChange(userId, { currentPassword, newPassword }) {
    const user = getUserOrThrow(userId);

    if (user.password_hash) {
      if (!currentPassword || !(await bcrypt.compare(currentPassword, user.password_hash))) {
        const error = new Error("Current password is incorrect.");
        error.statusCode = 401;
        throw error;
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await createVerification({
      email: user.email,
      userId,
      purpose: "change_password",
      passwordHash
    });

    return {
      message: "Verification code sent to your account email.",
      email: user.email,
      expiresInSeconds: CODE_TTL_MINUTES * 60
    };
  }

  function verifyPasswordChange(userId, { code }) {
    const user = getUserOrThrow(userId);
    const verification = consumeVerification({
      userId,
      purpose: "change_password",
      code
    });

    if (verification.email.toLowerCase() !== user.email.toLowerCase()) {
      const error = new Error("Verification request is no longer valid.");
      error.statusCode = 400;
      throw error;
    }

    const authProvider = user.google_id ? "both" : "email";
    database.prepare(`
      UPDATE users
      SET password_hash = ?, auth_provider = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(verification.password_hash, authProvider, userId);

    return {
      message: user.password_hash
        ? "Password updated successfully."
        : "Password created successfully.",
      user: getProfile(userId)
    };
  }

  return {
    register,
    verifyRegistration,
    login,
    loginWithGoogle,
    getProfile,
    updateProfile,
    requestPasswordChange,
    verifyPasswordChange
  };
}
