import express, { type Express } from "express";
import cors from "cors";
import { pinoHttp, type Options as PinoHttpOptions } from "pino-http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { clerkMiddleware } from "@clerk/express";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";
import { handleStripeWebhook } from "./lib/stripeWebhook";

const app: Express = express();

// Stripe webhook MUST be registered before express.json() to receive raw body.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  (req, res) => {
    void handleStripeWebhook(req, res);
  },
);

const pinoHttpOptions: PinoHttpOptions = {
  logger,
  serializers: {
    req(req: IncomingMessage & { id?: string | number }) {
      return {
        id: req.id,
        method: req.method,
        url: req.url?.split("?")[0],
      };
    },
    res(res: ServerResponse) {
      return {
        statusCode: res.statusCode,
      };
    },
  },
};
app.use(pinoHttp(pinoHttpOptions));

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(clerkMiddleware());

app.use("/api", router);

export default app;
