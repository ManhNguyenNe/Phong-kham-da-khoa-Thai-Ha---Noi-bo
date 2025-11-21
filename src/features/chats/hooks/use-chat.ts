import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { useToast } from '@/hooks/use-toast'
import {
  fetchConversations,
  fetchMessages,
  fetchMoreMessages,
} from '../api/chat'
import { uploadChatImages } from '../api/upload'
import { wsClient } from '@/lib/websocket-client'
import type { Message } from '../types'
import type { Conversation } from '../types'

export function useConversations() {
  return useQuery({
    queryKey: ['conversations'],
    queryFn: fetchConversations,
    staleTime: 30000,
    retry: 2,
  })
}

export function useMessages(conversationId: number | null) {
  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => fetchMessages(conversationId!),
    enabled: !!conversationId,
    staleTime: 10000,
    retry: 2,
  })
}

export function useLoadMoreMessages() {
  const queryClient = useQueryClient()
  const { toast } = useToast()

  return useMutation({
    mutationFn: ({
      conversationId,
      beforeId,
    }: {
      conversationId: number
      beforeId: number
    }) => fetchMoreMessages(conversationId, beforeId),
    onSuccess: (data, variables) => {
      queryClient.setQueryData(
        ['messages', variables.conversationId],
        (oldData: any) => {
          if (!oldData) return data
          return {
            ...data,
            messages: [...data.messages, ...oldData.messages],
          }
        }
      )
    },
    onError: (error) => {
      console.error('Failed to load more messages:', error)
      toast({
        title: 'Lỗi',
        description: 'Không thể tải thêm tin nhắn',
        variant: 'destructive',
      })
    },
  })
}

export function useUploadChatImages() {
  const { toast } = useToast()

  return useMutation({
    mutationFn: uploadChatImages,
    onError: (error) => {
      console.error('Upload error:', error)
      toast({
        title: 'Lỗi',
        description: 'Không thể tải ảnh lên',
        variant: 'destructive',
      })
    },
  })
}

export function useSendMessage() {
  const { toast } = useToast()

  return useMutation({
    mutationFn: async ({
      conversationId,
      senderId,
      message,
      urls,
      token,
    }: {
      conversationId: number
      senderId: number
      message: string
      urls: string[]
      token: string
    }) => {
      if (!wsClient.isConnected()) {
        await wsClient.connect()
      }
      const sentTime = new Date().toISOString()
      wsClient.sendChatMessage({
        conversationId,
        senderId,
        message,
        sentTime,
        urls,
      }, token)
      return { conversationId, senderId, message, sentTime, urls }
    },
    onSuccess: (data) => {
      // No optimistic update - rely on WebSocket to add the message
      // This prevents duplicates when server's sentTime differs from client's
      console.log('Message sent successfully, waiting for WebSocket confirmation:', data)
    },
    onError: (error) => {
      console.error('Failed to send message:', error)
      toast({
        title: 'Lỗi',
        description: 'Không thể gửi tin nhắn',
        variant: 'destructive',
      })
    },
  })
}

export function useChatSubscription(
  conversationId: number | null,
  enabled: boolean,
  onMessageReceived?: (message: Message) => void
) {
  const queryClient = useQueryClient()
  const callbackRef = useRef(onMessageReceived)

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = onMessageReceived
  }, [onMessageReceived])

  useEffect(() => {
    if (!enabled || !conversationId) {
      return
    }

    let unsubscribe: (() => void) | null = null

    const setupSubscription = async () => {
      try {
        // Ensure WebSocket is connected
        if (!wsClient.isConnected()) {
          console.log('🔄 WebSocket not connected, connecting...')
          await wsClient.connect()
        }

        // Unsubscribe old subscription if exists
        if (unsubscribe) {
          unsubscribe()
          unsubscribe = null
        }

        unsubscribe = wsClient.subscribeToChatConversation(conversationId, (message: Message) => {
          console.log('📨 Received message via WebSocket:', message)

          // Call callback if provided (for unread tracking)
          if (callbackRef.current) {
            callbackRef.current(message)
          }

          queryClient.setQueryData(['messages', conversationId], (oldData: any) => {
            if (!oldData) {
              console.log('📝 No old data, creating new message list')
              return { messages: [message], hasMoreOld: false }
            }

            // First, check if message already exists by server id
            const existsById = oldData.messages.some((msg: any) => msg.id === message.id)
            if (existsById) {
              console.log('⏭️ Message already exists by id, skipping:', message.id)
              return oldData
            }

            // Some messages are optimistically added with a temporary id (e.g. Date.now())
            // Detect optimistic message by matching senderId + sentTime (stable client-generated value)
            const optIndex = oldData.messages.findIndex((msg: any) =>
              msg.sentTime === message.sentTime && msg.senderId === message.senderId
            )

            if (optIndex !== -1) {
              // Replace optimistic message with authoritative server message
              const newMessages = [...oldData.messages]
              newMessages[optIndex] = message
              console.log('🔁 Replaced optimistic message with server message:', message.id)
              return {
                ...oldData,
                messages: newMessages,
              }
            }

            // Otherwise append as new message
            console.log('✅ Adding new message to list:', message.id)
            return {
              ...oldData,
              messages: [...oldData.messages, message],
            }
          })

          // Update conversations list to show latest message
          queryClient.invalidateQueries({ queryKey: ['conversations'] })
        })

        console.log('Chat subscription established for conversation:', conversationId)
      } catch (error) {
        console.error('Failed to subscribe to chat:', error)
      }
    }

    setupSubscription()

    return () => {
      if (unsubscribe) {
        unsubscribe()
        console.log('Chat subscription closed for conversation:', conversationId)
      }
    }
  }, [conversationId, enabled, queryClient])
}

/**
 * Hook to subscribe to ALL conversations for unread tracking
 * Subscribe to all conversations at once when user is logged in
 */
export function useAllConversationsSubscription(
  conversations: Conversation[] | undefined,
  currentConversationId: number | null,
  onNewMessage: (conversationId: number, message: Message) => void
) {
  const queryClient = useQueryClient()
  const callbackRef = useRef(onNewMessage)

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = onNewMessage
  }, [onNewMessage])

  useEffect(() => {
    if (!conversations || conversations.length === 0) {
      return
    }

    const unsubscribers: (() => void)[] = []

    const setupAllSubscriptions = async () => {
      try {
        if (!wsClient.isConnected()) {
          await wsClient.connect()
        }

        // Subscribe to each conversation (EXCEPT the currently active one)
        conversations.forEach((conv) => {
          // Skip if this is the currently active conversation
          // (it will be handled by useChatSubscription)
          if (conv.id === currentConversationId) {
            console.log(`⏭️ Skipping subscription to current conversation ${conv.id}`)
            return
          }

          const unsubscribe = wsClient.subscribeToChatConversation(
            conv.id,
            (message: Message) => {
              // Only track as unread if NOT currently viewing this conversation
              if (conv.id !== currentConversationId) {
                console.log(`📩 New message from conversation ${conv.id} (not current)`)
                callbackRef.current(conv.id, message)
              }

              // Update conversations list (for last message preview)
              queryClient.invalidateQueries({ queryKey: ['conversations'] })
            }
          )
          unsubscribers.push(unsubscribe)
        })

        console.log(`✅ Subscribed to ${unsubscribers.length}/${conversations.length} conversations for unread tracking (excluding current)`)
      } catch (error) {
        console.error('❌ Failed to subscribe to all conversations:', error)
      }
    }

    setupAllSubscriptions()

    return () => {
      // Cleanup all subscriptions
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      console.log('🔌 Unsubscribed from all conversations')
    }
  }, [conversations, currentConversationId, queryClient])
}
