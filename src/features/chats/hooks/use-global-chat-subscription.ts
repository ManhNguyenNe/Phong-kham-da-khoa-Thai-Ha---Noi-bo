import { useEffect, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useUnreadStore } from '@/stores/unread-store'
import { useAuthStore } from '@/stores/auth-store'
import { UserRole } from '@/types/auth'
import { fetchConversations } from '../api/chat'
import { wsClient } from '@/lib/websocket-client'
import { useActiveConversationStore } from '@/stores/active-conversation-store'
import type { Message } from '../types'

/**
 * Global hook to track unread messages across all conversations
 * This should be used at the app root level (e.g., in _authenticated layout)
 * so that unread counts are tracked even when user is not on the chat page
 * 
 * IMPORTANT: This also updates messages cache for conversations that are NOT currently open
 * to ensure messages are visible when switching conversations
 */
export function useGlobalChatSubscription() {
  const { user } = useAuthStore()
  const { addUnreadMessage, setUnreadCount, getUnreadCount } = useUnreadStore()
  const queryClient = useQueryClient()

  // Only fetch conversations for LE_TAN role
  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: fetchConversations,
    staleTime: 30000,
    retry: 2,
    enabled: user?.role === UserRole.LE_TAN,
  })

  // Sync initial unread status from conversations API
  useEffect(() => {
    if (conversations && conversations.length > 0) {
      conversations.forEach((conv) => {
        if (conv.newMessage) {
          const currentUnread = getUnreadCount(conv.id)
          if (currentUnread === 0) {
            console.log(`🌍 [Global] Syncing unread for conversation ${conv.id}`)
            setUnreadCount(conv.id, 1)
          }
        }
      })
    }
  }, [conversations, getUnreadCount, setUnreadCount])

  // Subscribe to active conversation id so we can avoid showing unread for the one user is currently viewing
  const activeConversationId = useActiveConversationStore((s) => s.activeConversationId)

  // Callback for handling new messages
  const handleNewMessage = useCallback(
    (conversationId: number, message: Message) => {
      console.log(`🌍 [Global] New message from conversation ${conversationId}`)

      // If the user is currently viewing this conversation, do NOT add unread notification
      const isActive = activeConversationId && activeConversationId === conversationId
      if (!isActive) {
        // 1. Track unread
        addUnreadMessage(conversationId, message.sentTime)
      } else {
        console.log(`🌍 [Global] Conversation ${conversationId} is active — skip unread notification`)
      }

      // 2. Update messages cache for this conversation so messages are available when opening
      queryClient.setQueryData(['messages', conversationId], (oldData: any) => {
        if (!oldData) {
          console.log('🌍 [Global] Creating new message cache for', conversationId)
          return { messages: [message], hasMoreOld: false, totalUnread: 1, lastReadId: null, totalMessage: 1 }
        }

        // Check if message already exists
        const existsById = oldData.messages.some((msg: any) => msg.id === message.id)
        if (existsById) {
          console.log('🌍 [Global] Message already exists, skipping')
          return oldData
        }

        // Add new message
        console.log('🌍 [Global] Adding message to cache')
        return {
          ...oldData,
          messages: [...oldData.messages, message],
          totalMessage: (oldData.totalMessage || 0) + 1,
        }
      })

      // 3. Invalidate conversations list to update last message preview
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
    [addUnreadMessage, queryClient, activeConversationId]
  )

  // Subscribe to all conversations
  useEffect(() => {
    if (!conversations || conversations.length === 0 || user?.role !== UserRole.LE_TAN) {
      return
    }

    const unsubscribers: (() => void)[] = []

    const setupSubscriptions = async () => {
      try {
        if (!wsClient.isConnected()) {
          await wsClient.connect()
        }

        conversations.forEach((conv) => {
          const unsubscribe = wsClient.subscribeToChatConversation(
            conv.id,
            (message: Message) => {
              // Track all incoming messages globally
              handleNewMessage(conv.id, message)
            }
          )
          unsubscribers.push(unsubscribe)
        })

        console.log(`🌍 [Global] Subscribed to ${unsubscribers.length} conversations`)
      } catch (error) {
        console.error('🌍 [Global] Failed to subscribe:', error)
      }
    }

    setupSubscriptions()

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
      console.log('🌍 [Global] Unsubscribed from all conversations')
    }
  }, [conversations, handleNewMessage, user?.role])
}
