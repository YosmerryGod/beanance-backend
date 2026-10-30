import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../../src/app.js";

test("GET /api/v1/health returns service status", async (t) => {
  const app = await buildApp({
    nodeEnv: "test",
    databasePath: ":memory:"
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/api/v1/health"
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    status: "ok",
    service: "beanance-backend"
  });
});
