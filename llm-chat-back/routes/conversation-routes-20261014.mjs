import { Router } from "express";

import { authRequired } from "../auth.mjs";
import {
  classifyServerError,
  sendApiError,
} from "../app-errors.mjs";
import { config } from "../config.mjs";
import logger, { logApiError } from "../logger.mjs";
import {
  PaginationInputError,
  parseConversationCursor,
  parseMessageCursor,
  validateConversationId,
} from "../pagination.mjs";
import {
  getConversationByIdForUser,
  getConversationPage,
  getMessagePage,
} from "../services/conversation-service.mjs";
import { markActiveSpanError } from "../span-utils.mjs";

function normalizeMessage(message) {
  return {
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
  };
}

function sendPaginationError(req, res, error) {
  return sendApiError(req, res, error.code || "invalid_pagination_cursor", {
    status: 400,
    message: error.message,
    retryable: false,
  });
}

export function createConversationRouter(dependencies = {}) {
  const router = Router();
  const listConversationPage =
    dependencies.getConversationPage || getConversationPage;
  const findConversation =
    dependencies.getConversationByIdForUser || getConversationByIdForUser;
  const listMessagePage = dependencies.getMessagePage || getMessagePage;

  router.get("/", authRequired, async (req, res) => {
    try {
      const cursor = parseConversationCursor(req.query.cursor);
      const result = await listConversationPage({
        userId: req.user.userId,
        cursor,
        limit: config.conversationPageSize,
      });

      logger.info("conversations_request_success", {
        user_id: req.user.userId,
        conversation_count: result.conversations.length,
        has_more: result.pageInfo.hasMore,
      });
      return res.json(result);
    } catch (error) {
      if (error instanceof PaginationInputError) {
        return sendPaginationError(req, res, error);
      }

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
      const conversationId = validateConversationId(req.params.conversationId);
      const beforeId = parseMessageCursor(req.query.before);
      const userId = req.user.userId;
      const conversation = await findConversation(conversationId, userId);

      if (!conversation) {
        return sendApiError(req, res, "conversation_not_found");
      }

      const result = await listMessagePage({
        conversationId,
        beforeId,
        limit: config.messagePageSize,
      });
      const messages = result.messages.map(normalizeMessage);

      logger.info("conversation_messages_request_success", {
        user_id: userId,
        conversation_id: conversationId,
        message_count: messages.length,
        has_more: result.pageInfo.hasMore,
      });
      return res.json({
        messages,
        pageInfo: result.pageInfo,
      });
    } catch (error) {
      if (error instanceof PaginationInputError) {
        return sendPaginationError(req, res, error);
      }

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
