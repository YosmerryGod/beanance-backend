const emailSchema = {
  type: "string",
  minLength: 5,
  maxLength: 254,
  pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
};

export async function authRoutes(fastify) {
  const auth = fastify.authService;

  fastify.post("/register", {
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["email", "password"],
        properties: {
          email: emailSchema,
          password: { type: "string", minLength: 8, maxLength: 72 }
        }
      }
    }
  }, async (request, reply) => {
    const result = await auth.register(fastify, request.body);
    return reply.code(201).send(result);
  });

  fastify.post("/login", {
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["email", "password"],
        properties: {
          email: emailSchema,
          password: { type: "string", minLength: 1, maxLength: 72 }
        }
      }
    }
  }, async (request) => auth.login(fastify, request.body));

  fastify.post("/google", {
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["idToken"],
        properties: {
          idToken: { type: "string", minLength: 20, maxLength: 5000 }
        }
      }
    }
  }, async (request) => auth.loginWithGoogle(fastify, request.body.idToken));

  fastify.get("/me", {
    preHandler: async (request) => request.jwtVerify()
  }, async (request) => ({
    user: auth.getProfile(request.user.sub)
  }));
}
