import { create } from 'zustand'

interface ActiveConversationStore {
    activeConversationId: number | null
    setActiveConversation: (id: number | null) => void
    clearActiveConversation: () => void
}

export const useActiveConversationStore = create<ActiveConversationStore>((set) => ({
    activeConversationId: null,
    setActiveConversation: (id: number | null) => set(() => ({ activeConversationId: id })),
    clearActiveConversation: () => set(() => ({ activeConversationId: null })),
}))
