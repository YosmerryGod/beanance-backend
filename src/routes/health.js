export async function healthRoutes(fastify) {
  fastify.get("/health", {
    schema: {
      response: {
        200: {
          type: "object",
          properties: {
            status: { type: "string" },
            service: { type: "string" }
          },
          required: ["status", "service"]
        }
      }
    }
  }, async () => ({
    status: "ok",
    service: "beanance-backend"
  }));
}
