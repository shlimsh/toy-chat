import { Router } from "express";

import { authRequired } from "../auth.mjs";
import {
  classifyServerError,
  sendApiError,
} from "../app-errors.mjs";
import logger, { logApiError } from "../logger.mjs";
import {
  getConversationByIdForUser,
  getConversationsByUserId,
  getMessagesByConversationId,
} from "../services/conversation-service.mjs";
import { markActiveSpanError } from "../span-utils.mjs";

export function createConversationRouter() {
  const router = Router();

  router.get("/", authRequired, async (req, res) => {
    try {
      const conversations = await getConversationsByUserId(req.user.userId);
      logger.info("conversations_request_success", {
        user_id: req.user.userId,
        conversation_count: conversations.length,
      });
      return res.json({ conversations });
    } catch (error) {
      logApiError({
        req,
        event: "conversations_failed",
        error,
        userId: req.user?.userId,
        recoverable: false,
      });
      markActiveSpanError(error, {
        "app.feature": "conversations",
        "app.route": "GET /conversations",
        "app.user_id": req.user?.userId,
      });
      return sendApiError(
        req,
        res,
        classifyServerError(error, "internal_server_error")
      );
    }
  });

  router.get("/:conversationId/messages", authRequired, async (req, res) => {
    try {
      const { conversationId } = req.params;
      const userId = req.user.userId;
      const conversation = await getConversationByIdForUser(
        conversationId,
        userId
      );

      if (!conversation) {
        return sendApiError(req, res, "conversation_not_found");
      }

      const messages = await getMessagesByConversationId(conversationId);
      const normalizedMessages = messages.map((message) => ({
        ...message,
        status:
          message.metadata?.status ||
          (message.metadata?.error ? "failed" : undefined),
        provider: message.metadata?.provider || null,
        model: message.metadata?.model || null,
        error: message.metadata?.error
          ? {
              code: message.metadata?.error_code,
              message: message.metadata.error,
              retryable: Boolean(message.metadata?.retryable),
            }
          : null,
        trace: message.metadata?.trace || null,
      }));

      logger.info("conversation_messages_request_success", {
        user_id: userId,
        conversation_id: conversationId,
        message_count: messages.length,
      });
      return res.json({ messages: normalizedMessages });
    } catch (error) {
      logApiError({
        req,
        event: "conversation_messages_failed",
        error,
        userId: req.user?.userId,
        conversationId: req.params.conversationId,
        recoverable: false,
      });
      markActiveSpanError(error, {
        "app.feature": "conversation_messages",
        "app.route": "GET /conversations/:conversationId/messages",
        "app.user_id": req.user?.userId,
        "app.conversation_id": req.params?.conversationId,
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
