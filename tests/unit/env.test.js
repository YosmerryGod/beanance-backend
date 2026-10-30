import test from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../../src/config/env.js";

test("loadConfig returns defaults", () => {
  const config = loadConfig({});

  assert.equal(config.nodeEnv, "development");
  assert.equal(config.host, "0.0.0.0");
  assert.equal(config.port, 3000);
  assert.equal(config.databasePath, "./storage/beanance.sqlite");
});

test("loadConfig rejects an invalid port", () => {
  assert.throws(
    () => loadConfig({ PORT: "70000" }),
    /PORT must be a valid TCP port/
  );
});
