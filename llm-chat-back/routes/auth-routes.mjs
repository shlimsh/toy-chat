import { Router } from "express";

import {
  authRequired,
  comparePassword,
  hashPassword,
  signToken,
} from "../auth.mjs";
import {
  classifyServerError,
  getErrorDefinition,
  sendApiError,
} from "../app-errors.mjs";
import {
  logApiError,
  logApiInfo,
} from "../logger.mjs";
import {
  createUser,
  getUserByEmail,
  getUserById,
} from "../services/conversation-service.mjs";
import {
  createAuthenticationError,
  markActiveSpanError,
} from "../span-utils.mjs";

function recordAuthenticationFailure(req, code, metadata) {
  const definition = getErrorDefinition(code);
  const error = createAuthenticationError(definition.message, code);

  markActiveSpanError(error, {
    "app.feature": "auth",
    "app.route": "POST /auth/login",
    "app.error.code": code,
    "app.error.handled": true,
  });

  logApiError({
    req,
    event: "auth_login_failed",
    error,
    recoverable: true,
    metadata: {
      reason: code,
      ...metadata,
    },
  });
}

export function createAuthRouter() {
  const router = Router();

  router.post("/register", async (req, res) => {
    try {
      const { name, email, password } = req.body ?? {};
      if (!String(name || "").trim()) return sendApiError(req, res, "name_required");
      if (!String(email || "").trim()) return sendApiError(req, res, "email_required");
      if (!String(password || "").trim()) {
        return sendApiError(req, res, "password_required");
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      if (await getUserByEmail(normalizedEmail)) {
        return sendApiError(req, res, "email_already_exists");
      }

      const user = await createUser({
        name: String(name).trim(),
        email: normalizedEmail,
        passwordHash: await hashPassword(String(password)),
      });
      const token = signToken(user);

      logApiInfo({
        req,
        event: "auth_register_success",
        userId: user.id,
        metadata: { email: user.email },
      });
      return res.json({ token, user });
    } catch (error) {
      logApiError({
        req,
        event: "auth_register_failed",
        error,
        recoverable: false,
        metadata: { email: req.body?.email },
      });
      markActiveSpanError(error, {
        "app.feature": "auth",
        "app.route": "POST /auth/register",
      });
      return sendApiError(
        req,
        res,
        classifyServerError(error, "internal_server_error")
      );
    }
  });

  router.post("/login", async (req, res) => {
    try {
      const { email, password } = req.body ?? {};
      if (!String(email || "").trim()) return sendApiError(req, res, "email_required");
      if (!String(password || "").trim()) {
        return sendApiError(req, res, "password_required");
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      const user = await getUserByEmail(normalizedEmail);

      if (!user) {
        recordAuthenticationFailure(req, "user_not_found", {
          email: normalizedEmail,
        });
        return sendApiError(req, res, "user_not_found");
      }

      if (!(await comparePassword(String(password), user.password_hash))) {
        recordAuthenticationFailure(req, "invalid_password", {
          email: normalizedEmail,
          user_id: user.id,
        });
        return sendApiError(req, res, "invalid_password");
      }

      const safeUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        created_at: user.created_at,
        updated_at: user.updated_at,
      };
      const token = signToken(safeUser);

      logApiInfo({
        req,
        event: "auth_login_success",
        userId: safeUser.id,
        metadata: { email: safeUser.email },
      });
      return res.json({ token, user: safeUser });
    } catch (error) {
      logApiError({
        req,
        event: "auth_login_failed",
        error,
        recoverable: false,
        metadata: { email: req.body?.email },
      });
      markActiveSpanError(error, {
        "app.feature": "auth",
        "app.route": "POST /auth/login",
      });
      return sendApiError(
        req,
        res,
        classifyServerError(error, "internal_server_error")
      );
    }
  });

  router.get("/me", authRequired, async (req, res) => {
    try {
      const user = await getUserById(req.user.userId);
      if (!user) return sendApiError(req, res, "invalid_token");
      return res.json({ user });
    } catch (error) {
      logApiError({
        req,
        event: "auth_me_failed",
        error,
        userId: req.user?.userId,
        recoverable: false,
      });
      markActiveSpanError(error, {
        "app.feature": "auth",
        "app.route": "GET /auth/me",
        "app.user_id": req.user?.userId,
      });
      return sendApiError(
        req,
        res,
        classifyServerError(error, "internal_server_error")
      );
    }
  });

  return router;
}
