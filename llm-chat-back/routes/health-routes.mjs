import { Router } from "express";

import { config } from "../config.mjs";
import { checkDatabase } from "../db.mjs";
import logger from "../logger.mjs";
import { withRequestTimeout } from "../request-timeout.mjs";

export function createHealthRouter(runtimeState) {
  const router = Router();

  router.get("/", (_req, res) => {
    res.json({
      ok: true,
      service: config.service,
      version: config.version,
      openaiModel: config.openaiModel,
      azureOpenAIModel: config.azureModel,
      azureEnabled: config.azureEnabled,
    });
  });

  router.get("/live", (_req, res) => {
    const ok = !runtimeState.shuttingDown;
    res.status(ok ? 200 : 503).json({
      ok,
      status: ok ? "alive" : "shutting_down",
      service: config.service,
      version: config.version,
      uptimeSec: Math.floor(process.uptime()),
    });
  });

  router.get("/ready", async (_req, res) => {
    let database = runtimeState.databaseReady;
    let databaseMessage = null;

    if (database && !runtimeState.shuttingDown) {
      try {
        await withRequestTimeout(
          "database readiness check",
          config.readinessTimeoutMs,
          () => checkDatabase()
        );
      } catch (error) {
        database = false;
        databaseMessage = "database_check_failed";
        logger.warn("readiness_check_failed", {
          event: "readiness_check_failed",
          dependency: "mysql",
          error,
        });
      }
    }

    const checks = {
      database: database ? "ready" : databaseMessage || "not_ready",
      rag: runtimeState.ragReady ? "ready" : "not_ready",
      acceptingRequests: runtimeState.shuttingDown ? "no" : "yes",
    };
    const ok =
      database &&
      runtimeState.ragReady &&
      !runtimeState.shuttingDown;

    res.status(ok ? 200 : 503).json({
      ok,
      status: ok ? "ready" : "not_ready",
      service: config.service,
      version: config.version,
      checks,
    });
  });

  return router;
}
