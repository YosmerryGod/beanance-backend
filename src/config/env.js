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
    googleClientId: environment.GOOGLE_CLIENT_ID || ""
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

  return Object.freeze(config);
}
