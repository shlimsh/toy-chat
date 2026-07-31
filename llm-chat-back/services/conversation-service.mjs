import { config } from "../config.mjs";
import {
  createConversation,
  createMessage,
  createUser,
  getConversationByIdForUser,
  getConversationPageByUserId,
  getMessagePageByConversationId,
  getRecentMessagesByConversationId,
  getUserByEmail,
  getUserById,
} from "../repositories/chat-repository.mjs";

export {
  createConversation,
  createMessage,
  createUser,
  getConversationByIdForUser,
  getUserByEmail,
  getUserById,
};

export function getConversationPage({
  userId,
  cursor = null,
  limit = config.conversationPageSize,
}) {
  return getConversationPageByUserId({ userId, cursor, limit });
}

export function getMessagePage({
  conversationId,
  beforeId = null,
  limit = config.messagePageSize,
}) {
  return getMessagePageByConversationId({
    conversationId,
    beforeId,
    limit,
  });
}

export function getMessagesForLlm(
  conversationId,
  limit = config.llmHistoryMessageLimit
) {
  return getRecentMessagesByConversationId(conversationId, limit);
}
