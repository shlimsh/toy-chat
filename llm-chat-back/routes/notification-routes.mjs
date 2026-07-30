import { Router } from "express";

import { sendApiError } from "../app-errors.mjs";
import { authRequired } from "../auth.mjs";
import { logApiError, logApiInfo } from "../logger.mjs";
import { createUserRateLimitMiddleware } from "../rate-limit.mjs";

function smsErrorCode(error) {
  return error?.code === "SMS_NOT_CONFIGURED"
    ? "sms_not_configured"
    : "sms_unavailable";
}

export function createNotificationRouter({ smsService, limiter }) {
  const router = Router();
  const rateLimit = createUserRateLimitMiddleware({ limiter });

  router.post("/sms", authRequired, rateLimit, async (req, res) => {
    try {
      const result = await smsService.sendManagerNotification();

      logApiInfo({
        req,
        event: "sms_notification_accepted",
        userId: req.user.userId,
        metadata: {
          notification_type: "manager",
          outcome: result.status,
        },
      });

      return res.status(202).json(result);
    } catch (error) {
      const errorCode = smsErrorCode(error);

      logApiError({
        req,
        event: "sms_notification_failed",
        error,
        userId: req.user.userId,
        recoverable: errorCode !== "sms_not_configured",
        metadata: {
          error_code: errorCode,
          upstream_status: error?.status,
        },
      });

      return sendApiError(req, res, errorCode);
    }
  });

  return router;
}
