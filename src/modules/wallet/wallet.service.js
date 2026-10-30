import {
  createCipheriv,
  randomBytes,
  randomUUID
} from "node:crypto";
import { Wallet } from "ethers";

function encryptSecret(value, encryptionKey) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("hex"),
    tag.toString("hex"),
    encrypted.toString("hex")
  ].join(":");
}

function publicWallet(wallet) {
  return {
    id: wallet.id,
    address: wallet.address,
    chainId: wallet.chain_id,
    network: "BNB Smart Chain",
    isPrimary: wallet.is_primary === 1,
    createdAt: wallet.created_at
  };
}

export function createWalletService(database, encryptionKeyHex) {
  const encryptionKey = Buffer.from(encryptionKeyHex, "hex");

  if (encryptionKey.length !== 32) {
    throw new Error("Wallet encryption key must be exactly 32 bytes.");
  }

  const findWallet = database.prepare(
    "SELECT * FROM wallets WHERE id = ? AND user_id = ?"
  );

  function saveWallet(userId, wallet, mnemonic = null) {
    const id = randomUUID();
    const existingPrimary = database.prepare(
      "SELECT id FROM wallets WHERE user_id = ? AND is_primary = 1"
    ).get(userId);

    try {
      database.prepare(`
        INSERT INTO wallets (
          id, user_id, address, encrypted_private_key, encrypted_mnemonic,
          encryption_version, is_primary
        ) VALUES (?, ?, ?, ?, ?, 1, ?)
      `).run(
        id,
        userId,
        wallet.address,
        encryptSecret(wallet.privateKey, encryptionKey),
        mnemonic ? encryptSecret(mnemonic, encryptionKey) : null,
        existingPrimary ? 0 : 1
      );
    } catch (error) {
      if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
        const conflict = new Error("This wallet is already linked to your account.");
        conflict.statusCode = 409;
        throw conflict;
      }
      throw error;
    }

    return database.prepare("SELECT * FROM wallets WHERE id = ?").get(id);
  }

  function create(userId) {
    const wallet = Wallet.createRandom();
    const saved = saveWallet(userId, wallet, wallet.mnemonic.phrase);

    return {
      wallet: publicWallet(saved),
      recoveryPhrase: wallet.mnemonic.phrase,
      message: "Wallet created. Store your recovery phrase somewhere safe."
    };
  }

  function importWallet(userId, { privateKey, mnemonic }) {
    let wallet;
    let normalizedMnemonic = null;

    try {
      if (mnemonic) {
        normalizedMnemonic = mnemonic.trim().replace(/\\s+/g, " ");
        wallet = Wallet.fromPhrase(normalizedMnemonic);
      } else {
        const normalizedPrivateKey = privateKey.trim();
        const keyWithPrefix = normalizedPrivateKey.startsWith("0x")
          ? normalizedPrivateKey
          : `0x${normalizedPrivateKey}`;
        wallet = new Wallet(keyWithPrefix);
      }
    } catch {
      const error = new Error("Invalid private key or mnemonic phrase.");
      error.statusCode = 400;
      throw error;
    }

    return {
      wallet: publicWallet(saveWallet(userId, wallet, normalizedMnemonic)),
      message: "Wallet imported successfully."
    };
  }

  function list(userId) {
    return database.prepare(`
      SELECT id, address, is_primary, created_at
      FROM wallets
      WHERE user_id = ?
      ORDER BY is_primary DESC, created_at ASC
    `).all(userId).map(publicWallet);
  }

  function get(userId, walletId) {
    const wallet = findWallet.get(walletId, userId);

    if (!wallet) {
      const error = new Error("Wallet not found.");
      error.statusCode = 404;
      throw error;
    }

    return publicWallet(wallet);
  }

  function setPrimary(userId, walletId) {
    const wallet = findWallet.get(walletId, userId);

    if (!wallet) {
      const error = new Error("Wallet not found.");
      error.statusCode = 404;
      throw error;
    }

    const update = database.transaction(() => {
      database.prepare(
        "UPDATE wallets SET is_primary = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?"
      ).run(userId);
      database.prepare(
        "UPDATE wallets SET is_primary = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?"
      ).run(walletId, userId);
    });
    update();

    return get(userId, walletId);
  }

  function remove(userId, walletId) {
    const wallet = findWallet.get(walletId, userId);

    if (!wallet) {
      const error = new Error("Wallet not found.");
      error.statusCode = 404;
      throw error;
    }

    const removeTransaction = database.transaction(() => {
      database.prepare("DELETE FROM wallets WHERE id = ? AND user_id = ?")
        .run(walletId, userId);

      if (wallet.is_primary === 1) {
        const replacement = database.prepare(`
          SELECT id FROM wallets
          WHERE user_id = ?
          ORDER BY created_at ASC
          LIMIT 1
        `).get(userId);

        if (replacement) {
          database.prepare(`
            UPDATE wallets
            SET is_primary = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND user_id = ?
          `).run(replacement.id, userId);
        }
      }
    });
    removeTransaction();

    return { message: "Wallet deleted successfully." };
  }

  return {
    create,
    import: importWallet,
    list,
    get,
    setPrimary,
    remove
  };
}
