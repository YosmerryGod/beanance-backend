export async function exchangeRoutes(fastify) {
  const exchanges = fastify.exchangeService;
  const authenticate = async (request) => request.jwtVerify();

  fastify.post("/binance/connect", {
    preHandler: authenticate,
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["apiKey", "apiSecret"],
        properties: {
          apiKey: { type: "string", minLength: 20, maxLength: 128 },
          apiSecret: { type: "string", minLength: 20, maxLength: 128 },
          label: { type: "string", minLength: 2, maxLength: 40 }
        }
      }
    }
  }, async (request, reply) => {
    const result = await exchanges.connect(request.user.sub, request.body);
    return reply.code(201).send(result);
  });

  fastify.get("/", {
    preHandler: authenticate
  }, async (request) => ({
    exchangeAccounts: exchanges.list(request.user.sub)
  }));

  fastify.get("/:accountId", {
    preHandler: authenticate,
    schema: {
      params: {
        type: "object",
        required: ["accountId"],
        properties: {
          accountId: { type: "string", format: "uuid" }
        }
      }
    }
  }, async (request) => ({
    exchangeAccount: exchanges.get(request.user.sub, request.params.accountId)
  }));

  fastify.post("/:accountId/verify", {
    preHandler: authenticate,
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    schema: {
      params: {
        type: "object",
        required: ["accountId"],
        properties: {
          accountId: { type: "string", format: "uuid" }
        }
      }
    }
  }, async (request) => exchanges.verify(request.user.sub, request.params.accountId));

  fastify.delete("/:accountId", {
    preHandler: authenticate,
    schema: {
      params: {
        type: "object",
        required: ["accountId"],
        properties: {
          accountId: { type: "string", format: "uuid" }
        }
      }
    }
  }, async (request) => exchanges.disconnect(request.user.sub, request.params.accountId));
}
