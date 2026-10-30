import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID
} from "node:crypto";

const BINANCE_FUTURES_BASE_URL = "https://fapi.binance.com";
const RECV_WINDOW = 5000;

function encryptSecret(value, encryptionKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final()
  ]);

  return [
    "v1",
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    ciphertext.toString("hex")
  ].join(":");
}

function decryptSecret(payload, encryptionKey) {
  const [version, ivHex, tagHex, ciphertextHex] = payload.split(":");

  if (version !== "v1" || !ivHex || !tagHex || !ciphertextHex) {
    throw new Error("Unsupported or corrupted exchange credential.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey,
    Buffer.from(ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, "hex")),
    decipher.final()
  ]).toString("utf8");
}

function createHttpError(message, statusCode, code = undefined) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code !== undefined) error.exchangeCode = String(code);
  return error;
}

function publicExchangeAccount(account) {
  return {
    id: account.id,
    exchange: account.exchange,
    marketType: account.market_type,
    label: account.label,
    accountAlias: account.account_alias,
    status: account.status,
    lastVerifiedAt: account.last_verified_at,
    createdAt: account.created_at
  };
}

export function createExchangeService(database, encryptionKeyHex) {
  const encryptionKey = Buffer.from(encryptionKeyHex, "hex");

  if (encryptionKey.length !== 32) {
    throw new Error("Exchange encryption key must be exactly 32 bytes.");
  }

  const findAccount = database.prepare(
    "SELECT * FROM exchange_accounts WHERE id = ? AND user_id = ?"
  );

  async function requestFuturesAccount(apiKey, apiSecret) {
    const params = new URLSearchParams({
      recvWindow: String(RECV_WINDOW),
      timestamp: String(Date.now())
    });
    const signature = createHmac("sha256", apiSecret)
      .update(params.toString())
      .digest("hex");
    params.set("signature", signature);

    let response;

    try {
      response = await fetch(
        `${BINANCE_FUTURES_BASE_URL}/fapi/v3/account?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "X-MBX-APIKEY": apiKey,
            "Accept": "application/json"
          },
          signal: AbortSignal.timeout(10000)
        }
      );
    } catch {
      throw createHttpError(
        "Could not reach Binance Futures. Please try again.",
        502
      );
    }

    let payload;

    try {
      payload = await response.json();
    } catch {
      throw createHttpError("Binance returned an invalid response.", 502);
    }

    if (!response.ok) {
      const code = payload?.code;

      if (code === -2015 || code === -2014) {
        throw createHttpError(
          "Binance API key is invalid or does not have the required Futures account access.",
          400,
          code
        );
      }

      if (code === -1021) {
        throw createHttpError(
          "Binance rejected the request timestamp. Check server time synchronization and try again.",
          400,
          code
        );
      }

      if (code === -1022) {
        throw createHttpError(
          "Binance signature validation failed. Check the API Secret.",
          400,
          code
        );
      }

      throw createHttpError(
        "Binance could not verify this Futures account. Check API permissions and try again.",
        400,
        code
      );
    }

    return payload;
  }

  function getDecryptedCredentials(account) {
    return {
      apiKey: decryptSecret(account.encrypted_api_key, encryptionKey),
      apiSecret: decryptSecret(account.encrypted_api_secret, encryptionKey)
    };
  }

  async function connect(userId, { apiKey, apiSecret, label }) {
    const normalizedApiKey = apiKey.trim();
    const normalizedApiSecret = apiSecret.trim();
    const normalizedLabel = (label || "Binance Futures").trim();

    if (!normalizedApiKey || !normalizedApiSecret) {
      throw createHttpError("API Key and API Secret are required.", 400);
    }

    if (normalizedLabel.length < 2 || normalizedLabel.length > 40) {
      throw createHttpError("Account label must be between 2 and 40 characters.", 400);
    }

    // Verify credentials before storing them.
    const accountInfo = await requestFuturesAccount(
      normalizedApiKey,
      normalizedApiSecret
    );

    const id = randomUUID();

    try {
      database.prepare(`
        INSERT INTO exchange_accounts (
          id, user_id, exchange, market_type, label,
          encrypted_api_key, encrypted_api_secret,
          encryption_version, account_alias, status, last_verified_at
        ) VALUES (?, ?, 'binance', 'usdm_futures', ?, ?, ?, 1, ?, 'connected', CURRENT_TIMESTAMP)
      `).run(
        id,
        userId,
        normalizedLabel,
        encryptSecret(normalizedApiKey, encryptionKey),
        encryptSecret(normalizedApiSecret, encryptionKey),
        accountInfo.accountAlias || null
      );
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        throw createHttpError(
          "An exchange account with this label already exists. Choose another label.",
          409
        );
      }
      throw error;
    }

    const saved = findAccount.get(id, userId);

    return {
      exchangeAccount: publicExchangeAccount(saved),
      verification: {
        accountAccess: "verified",
        market: "USDT-M Futures",
        tradingPermission: "not_checked",
        withdrawalPermission: "not_requested"
      },
      message: "Binance Futures account connected. Trading permission has not been tested."
    };
  }

  function list(userId) {
    return database.prepare(`
      SELECT id, exchange, market_type, label, account_alias,
             status, last_verified_at, created_at
      FROM exchange_accounts
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(userId).map(publicExchangeAccount);
  }

  function get(userId, accountId) {
    const account = findAccount.get(accountId, userId);

    if (!account) {
      throw createHttpError("Exchange account not found.", 404);
    }

    return publicExchangeAccount(account);
  }

  async function verify(userId, accountId) {
    const account = findAccount.get(accountId, userId);

    if (!account) {
      throw createHttpError("Exchange account not found.", 404);
    }

    const credentials = getDecryptedCredentials(account);

    try {
      const accountInfo = await requestFuturesAccount(
        credentials.apiKey,
        credentials.apiSecret
      );

      database.prepare(`
        UPDATE exchange_accounts
        SET status = 'connected',
            account_alias = ?,
            last_verified_at = CURRENT_TIMESTAMP,
            last_error_code = NULL,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).run(accountInfo.accountAlias || null, accountId, userId);

      return {
        exchangeAccount: get(userId, accountId),
        verification: {
          accountAccess: "verified",
          market: "USDT-M Futures",
          tradingPermission: "not_checked",
          withdrawalPermission: "not_requested"
        },
        message: "Binance Futures account verified successfully."
      };
    } catch (error) {
      database.prepare(`
        UPDATE exchange_accounts
        SET status = 'error',
            last_error_code = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).run(error.exchangeCode || "VERIFY_FAILED", accountId, userId);
      throw error;
    }
  }

  function disconnect(userId, accountId) {
    const account = findAccount.get(accountId, userId);

    if (!account) {
      throw createHttpError("Exchange account not found.", 404);
    }

    database.prepare(
      "DELETE FROM exchange_accounts WHERE id = ? AND user_id = ?"
    ).run(accountId, userId);

    return { message: "Binance Futures account disconnected successfully." };
  }

  return {
    connect,
    list,
    get,
    verify,
    disconnect
  };
}
