import Fastify from "fastify";
import dbPlugin from "./plugins/db.js";
import notasRoutes from "./routes/notas.js";

const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

app.register(dbPlugin);
app.get("/health", async () => ({ status: "ok", db: "mongodb" }));
app.register(notasRoutes, { prefix: "/notas" });

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
