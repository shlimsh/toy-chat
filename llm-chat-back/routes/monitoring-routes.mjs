import { Router } from "express";

import { sendApiError } from "../app-errors.mjs";
import { config } from "../config.mjs";
import { logApiError } from "../logger.mjs";
import { getMonitoringSummary } from "../services/monitoring-service.mjs";

export function createMonitoringRouter({ metricsApi }) {
  const router = Router();

  router.get("/test", (_req, res) => {
    res.json({ ok: true, message: "monitoring route alive" });
  });

  router.get("/summary", async (req, res) => {
    try {
      return res.json(await getMonitoringSummary(metricsApi));
    } catch (error) {
      logApiError({
        req,
        event: "monitoring_summary_failed",
        error,
        recoverable: true,
        metadata: { datadog_site: config.ddSite },
      });
      return sendApiError(req, res, "monitoring_unavailable");
    }
  });

  return router;
}

