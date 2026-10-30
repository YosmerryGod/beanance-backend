const emailSchema = {
  type: "string",
  minLength: 5,
  maxLength: 254,
  pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$"
};

const verificationCodeSchema = {
  type: "string",
  minLength: 6,
  maxLength: 6,
  pattern: "^[0-9]{6}$"
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
    const result = await auth.register(request.body);
    return reply.code(202).send(result);
  });

  fastify.post("/register/verify", {
    config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["email", "code"],
        properties: {
          email: emailSchema,
          code: verificationCodeSchema
        }
      }
    }
  }, async (request) => auth.verifyRegistration(fastify, request.body));

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

  fastify.patch("/profile", {
    preHandler: async (request) => request.jwtVerify(),
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        minProperties: 1,
        properties: {
          username: {
            type: "string",
            minLength: 3,
            maxLength: 20,
            pattern: "^[a-zA-Z0-9_]+$"
          },
          avatarUrl: {
            anyOf: [
              { type: "string", format: "uri", maxLength: 2048 },
              { type: "null" }
            ]
          }
        }
      }
    }
  }, async (request) => ({
    user: auth.updateProfile(request.user.sub, request.body)
  }));

  fastify.post("/password/request-code", {
    preHandler: async (request) => request.jwtVerify(),
    config: { rateLimit: { max: 3, timeWindow: "15 minutes" } },
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["newPassword"],
        properties: {
          currentPassword: { type: "string", minLength: 1, maxLength: 72 },
          newPassword: { type: "string", minLength: 8, maxLength: 72 }
        }
      }
    }
  }, async (request) => auth.requestPasswordChange(request.user.sub, request.body));

  fastify.post("/password/verify-code", {
    preHandler: async (request) => request.jwtVerify(),
    config: { rateLimit: { max: 5, timeWindow: "15 minutes" } },
    schema: {
      body: {
        type: "object",
        additionalProperties: false,
        required: ["code"],
        properties: {
          code: verificationCodeSchema
        }
      }
    }
  }, async (request) => auth.verifyPasswordChange(request.user.sub, request.body));
}
