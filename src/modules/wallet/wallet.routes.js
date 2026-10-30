export async function walletRoutes(fastify) {
  const wallets = fastify.walletService;
  const authenticate = async (request) => request.jwtVerify();

  fastify.post("/create", {
    preHandler: authenticate,
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } }
  }, async (request, reply) => {
    return reply.code(201).send(wallets.create(request.user.sub));
  });

  fastify.post("/import", {
    preHandler: authenticate,
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        oneOf: [
          {
            required: ["privateKey"],
            properties: {
              privateKey: { type: "string", minLength: 64, maxLength: 132 }
            }
          },
          {
            required: ["mnemonic"],
            properties: {
              mnemonic: { type: "string", minLength: 12, maxLength: 300 }
            }
          }
        ]
      }
    }
  }, async (request, reply) => {
    return reply.code(201).send(wallets.import(request.user.sub, request.body));
  });

  fastify.get("/", {
    preHandler: authenticate
  }, async (request) => ({
    wallets: wallets.list(request.user.sub)
  }));

  fastify.get("/:walletId", {
    preHandler: authenticate,
    schema: {
      params: {
        type: "object",
        required: ["walletId"],
        properties: {
          walletId: { type: "string", format: "uuid" }
        }
      }
    }
  }, async (request) => ({
    wallet: wallets.get(request.user.sub, request.params.walletId)
  }));

  fastify.patch("/:walletId/primary", {
    preHandler: authenticate,
    schema: {
      params: {
        type: "object",
        required: ["walletId"],
        properties: {
          walletId: { type: "string", format: "uuid" }
        }
      }
    }
  }, async (request) => ({
    wallet: wallets.setPrimary(request.user.sub, request.params.walletId)
  }));

  fastify.delete("/:walletId", {
    preHandler: authenticate,
    schema: {
      params: {
        type: "object",
        required: ["walletId"],
        properties: {
          walletId: { type: "string", format: "uuid" }
        }
      }
    }
  }, async (request) => wallets.remove(request.user.sub, request.params.walletId));
}
