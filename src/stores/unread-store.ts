import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UnreadMessage {
    conversationId: number
    count: number
    lastMessageTime: string
}

interface UnreadStore {
    unreadMap: Map<number, UnreadMessage>
    addUnreadMessage: (conversationId: number, messageTime: string) => void
    setUnreadCount: (conversationId: number, count: number, messageTime?: string) => void
    clearUnread: (conversationId: number) => void
    getUnreadCount: (conversationId: number) => number
    getTotalUnread: () => number
}

export const useUnreadStore = create<UnreadStore>()(
    persist(
        (set, get) => ({
            unreadMap: new Map(),

            addUnreadMessage: (conversationId: number, messageTime: string) => {
                set((state) => {
                    const newMap = new Map(state.unreadMap)
                    const existing = newMap.get(conversationId)

                    if (existing) {
                        newMap.set(conversationId, {
                            conversationId,
                            count: existing.count + 1,
                            lastMessageTime: messageTime,
                        })
                    } else {
                        newMap.set(conversationId, {
                            conversationId,
                            count: 1,
                            lastMessageTime: messageTime,
                        })
                    }

                    return { unreadMap: newMap }
                })
            },

            setUnreadCount: (conversationId: number, count: number, messageTime?: string) => {
                set((state) => {
                    const newMap = new Map(state.unreadMap)

                    if (count > 0) {
                        newMap.set(conversationId, {
                            conversationId,
                            count,
                            lastMessageTime: messageTime || new Date().toISOString(),
                        })
                    } else {
                        // If count is 0, remove from map
                        newMap.delete(conversationId)
                    }

                    return { unreadMap: newMap }
                })
            },

            clearUnread: (conversationId: number) => {
                set((state) => {
                    const newMap = new Map(state.unreadMap)
                    newMap.delete(conversationId)
                    return { unreadMap: newMap }
                })
            },

            getUnreadCount: (conversationId: number) => {
                return get().unreadMap.get(conversationId)?.count || 0
            },

            getTotalUnread: () => {
                let total = 0
                get().unreadMap.forEach((unread) => {
                    total += unread.count
                })
                return total
            },
        }),
        {
            name: 'chat-unread-storage',
            partialize: (state) => ({
                // Map không thể lưu trực tiếp, cần chuyển thành array
                unreadMap: Array.from(state.unreadMap.entries()),
            }),
            merge: (persistedState: any, currentState) => {
                // Chuyển array về Map, nếu không có thì trả về Map rỗng
                const map = new Map<number, UnreadMessage>(
                    Array.isArray(persistedState?.unreadMap)
                        ? persistedState.unreadMap as [number, UnreadMessage][]
                        : []
                )
                return {
                    ...currentState,
                    unreadMap: map,
                }
            },
        }
    )
)
