const requiredDefaults = {
  NODE_ENV: "development",
  HOST: "0.0.0.0",
  PORT: "3000",
  DATABASE_PATH: "./storage/beanance.sqlite"
};

export function loadConfig(environment = process.env) {
  const config = {
    nodeEnv: environment.NODE_ENV || requiredDefaults.NODE_ENV,
    host: environment.HOST || requiredDefaults.HOST,
    port: Number(environment.PORT || requiredDefaults.PORT),
    databasePath: environment.DATABASE_PATH || requiredDefaults.DATABASE_PATH
  };

  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error("PORT must be a valid TCP port between 1 and 65535.");
  }

  if (!config.databasePath.trim()) {
    throw new Error("DATABASE_PATH must not be empty.");
  }

  return Object.freeze(config);
}
