import { Router } from "express";

import { sendApiError } from "../app-errors.mjs";
import { authRequired } from "../auth.mjs";
import { config } from "../config.mjs";
import { logApiError, logApiWarn } from "../logger.mjs";
import { getMonitoringSummary } from "../services/monitoring-service.mjs";

export function createMonitoringRouter({ metricsApi }) {
  const router = Router();

  router.get("/summary", authRequired, async (req, res) => {
    try {
      const summary = await getMonitoringSummary(metricsApi, {
        service: config.service,
        env: config.env,
        rumService: config.monitoringRumService,
        rumMetric: config.monitoringRumMetric,
      });

      if (summary.status === "partial") {
        logApiWarn({
          req,
          event: "monitoring_summary_partial",
          userId: req.user.userId,
          reason: "one_or_more_metric_queries_failed",
          recoverable: true,
          metadata: {
            unavailable_metrics: summary.unavailableMetrics,
            datadog_site: config.ddSite,
          },
        });
      }

      return res.json(summary);
    } catch (error) {
      logApiError({
        req,
        event: "monitoring_summary_failed",
        error,
        userId: req.user.userId,
        recoverable: true,
        metadata: {
          datadog_site: config.ddSite,
          failed_metrics: error?.failedMetrics,
        },
      });
      return sendApiError(req, res, "monitoring_unavailable");
    }
  });

  return router;
}
