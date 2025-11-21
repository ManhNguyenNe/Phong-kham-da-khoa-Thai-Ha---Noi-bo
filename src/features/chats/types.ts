/**
 * Chat Types based on API documentation
 */

/**
 * Responder type - Who is handling the conversation
 */
export enum ResponderType {
  LE_TAN = 'LE_TAN', // Receptionist
}

/**
 * Message from API
 */
export interface Message {
  id: number
  conversationId: number
  senderId: number
  message: string
  sentTime: string // ISO 8601 format: "2025-10-26T16:06:34"
  urls: string[]
}

/**
 * Conversation from API
 */
export interface Conversation {
  id: number
  patientName: string // e.g., "Phạm Ngọc Tiến - 0395527082"
  responder: ResponderType
  newMessage: boolean
}

/**
 * Message history response from GET /api/conversations/{id}/messages
 */
export interface MessageHistoryResponse {
  messages: Message[]
  lastReadId: number
  totalUnread: number
  totalMessage: number
  hasMoreOld: boolean
}

/**
 * Load more messages response from GET /api/conversations/{id}/messages/more
 */
export interface LoadMoreMessagesResponse {
  messages: Message[]
  lastReadId: number
  totalUnread: number
  totalMessage: number
  hasMoreOld: boolean
}

/**
 * Message DTO for sending via WebSocket
 */
export interface MessageDTO {
  conversationId: number
  senderId: number
  message: string
  sentTime: string // ISO 8601 format
  urls: string[]
}

/**
 * API Response wrapper
 */
export interface ApiResponse<T> {
  data: T
  message: string
}
