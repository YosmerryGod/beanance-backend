const defaults = {
  NODE_ENV: "development",
  HOST: "0.0.0.0",
  PORT: "3000",
  DATABASE_PATH: "./storage/beanance.sqlite"
};

export function loadConfig(environment = process.env) {
  const config = {
    nodeEnv: environment.NODE_ENV || defaults.NODE_ENV,
    host: environment.HOST || defaults.HOST,
    port: Number(environment.PORT || defaults.PORT),
    databasePath: environment.DATABASE_PATH || defaults.DATABASE_PATH,
    jwtSecret: environment.JWT_SECRET || (environment.NODE_ENV === "production" ? "" : "local-development-secret-change-before-deploy"),
    googleClientId: environment.GOOGLE_CLIENT_ID || "",
    smtpHost: environment.SMTP_HOST || "",
    smtpPort: Number(environment.SMTP_PORT || 587),
    smtpSecure: environment.SMTP_SECURE === "true",
    smtpUser: environment.SMTP_USER || "",
    smtpPassword: environment.SMTP_PASSWORD || "",
    smtpFrom: environment.SMTP_FROM || "",
    walletEncryptionKey: environment.WALLET_ENCRYPTION_KEY || (environment.NODE_ENV === "production" ? "" : "11".repeat(32)),
    exchangeEncryptionKey: environment.EXCHANGE_ENCRYPTION_KEY || (environment.NODE_ENV === "production" ? "" : "22".repeat(32))
  };

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error("PORT must be a valid TCP port between 1 and 65535.");
  }

  if (!config.databasePath.trim()) {
    throw new Error("DATABASE_PATH must not be empty.");
  }

  if (config.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters.");
  }

  if (config.walletEncryptionKey && !/^[a-fA-F0-9]{64}$/.test(config.walletEncryptionKey)) {
    throw new Error("WALLET_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes).");
  }

  if (config.nodeEnv === "production" && !config.walletEncryptionKey) {
    throw new Error("WALLET_ENCRYPTION_KEY is required in production.");
  }

  if (config.exchangeEncryptionKey && !/^[a-fA-F0-9]{64}$/.test(config.exchangeEncryptionKey)) {\n    throw new Error("EXCHANGE_ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes).");\n  }\n\n  if (config.nodeEnv === "production" && !config.exchangeEncryptionKey) {\n    throw new Error("EXCHANGE_ENCRYPTION_KEY is required in production.");\n  }\n\n  if (!Number.isInteger(config.smtpPort) || config.smtpPort < 1 || config.smtpPort > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port.");
  }

  return Object.freeze(config);
}
