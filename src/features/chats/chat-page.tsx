import { useEffect, useState, useRef, FormEvent, useCallback } from 'react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  ArrowLeft,
  Loader2,
  MessagesSquare,
  MoreVertical,
  Search as SearchIcon,
  Send,
  ImagePlus,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { HeaderActions } from '@/components/layout/header-actions'
import { Search } from '@/components/search'

import { useAuthStore } from '@/stores/auth-store'
import { useUnreadStore } from '@/stores/unread-store'
import { useActiveConversationStore } from '@/stores/active-conversation-store'
import { getAuthToken } from '@/lib/auth-storage'
import { wsClient } from '@/lib/websocket-client'
import {
  useConversations,
  useMessages,
  useLoadMoreMessages,
  useSendMessage,
  useChatSubscription,
  useUploadChatImages,
} from './hooks/use-chat'
import type { Conversation, Message } from './types'
import { ImageModal } from './components/image-modal'

export function Chats() {
  const { user } = useAuthStore()
  const { clearUnread, getUnreadCount, setUnreadCount } = useUnreadStore()
  const [search, setSearch] = useState('')
  const [selectedConversation, setSelectedConversation] =
    useState<Conversation | null>(null)
  const [mobileSelectedConversation, setMobileSelectedConversation] =
    useState<Conversation | null>(null)
  const [messageInput, setMessageInput] = useState('')
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [showLoadMore, setShowLoadMore] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isLoadingMoreRef = useRef(false)
  const hasInitialScrolled = useRef(false)
  const isSendingMessageRef = useRef(false) // Track when user is sending message

  // Fetch conversations
  const { data: conversations, isLoading: isLoadingConversations } =
    useConversations()

  // Sync unread status from conversations API on initial load
  useEffect(() => {
    if (conversations && conversations.length > 0) {
      conversations.forEach((conv) => {
        // If conversation has newMessage flag, mark it as having 1 unread
        // (We don't have exact count from conversations API, but we know there's at least 1)
        if (conv.newMessage) {
          const currentUnread = getUnreadCount(conv.id)
          // Only set if not already tracked (to avoid overwriting WebSocket updates)
          if (currentUnread === 0) {
            console.log(`📩 Syncing unread for conversation ${conv.id} from API`)
            setUnreadCount(conv.id, 1)
          }
        }
      })
    }
  }, [conversations, getUnreadCount, setUnreadCount])

  // NOTE: Global subscription is now handled by useGlobalChatSubscription in AuthenticatedLayout
  // No need to subscribe to all conversations here

  // Fetch messages for selected conversation
  const { data: messagesData, isLoading: isLoadingMessages } = useMessages(
    selectedConversation?.id || null
  )

  // Load more messages mutation
  const { mutate: loadMoreMessages, isPending: isLoadingMore } =
    useLoadMoreMessages()

  // Send message mutation
  const { mutate: sendMessage, isPending: isSendingMessage } = useSendMessage()

  // Upload images mutation
  const { mutate: uploadImages, isPending: isUploadingImages } =
    useUploadChatImages()

  // Connect to WebSocket on mount
  useEffect(() => {
    const connectWs = async () => {
      try {
        if (!wsClient.isConnected()) {
          await wsClient.connect()
          console.log('✅ Chat page: WebSocket connected')
        }
      } catch (error) {
        console.error('Failed to connect to WebSocket:', error)
      }
    }
    connectWs()

    // NOTE: Không disconnect khi unmount vì có thể có components khác đang dùng WebSocket
    // WebSocket sẽ được quản lý globally và tự reconnect khi cần
  }, [])

  // Memoize callback to prevent re-subscription on every render
  const handleMessageReceived = useCallback(() => {
    // Clear unread when viewing this conversation and receiving message
    if (selectedConversation?.id) {
      clearUnread(selectedConversation.id)
    }
  }, [selectedConversation?.id, clearUnread])

  // Subscribe to chat updates for selected conversation
  useChatSubscription(
    selectedConversation?.id || null,
    !!selectedConversation?.id,
    handleMessageReceived
  )

  // Set/clear active conversation and clear unread when switching
  useEffect(() => {
    if (selectedConversation?.id) {
      // Mark this conversation as active (so global subscription won't show notifications for it)
      useActiveConversationStore.getState().setActiveConversation(selectedConversation.id)
      clearUnread(selectedConversation.id)
    } else {
      useActiveConversationStore.getState().clearActiveConversation()
    }

    // Clear active conversation when component unmounts
    return () => {
      useActiveConversationStore.getState().clearActiveConversation()
    }
  }, [selectedConversation?.id, clearUnread])

  // Detect scroll to show/hide load more button
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    const handleScroll = () => {
      const scrollTop = scrollContainer.scrollTop
      // Show button when scrolled within 100px of top
      setShowLoadMore(scrollTop < 100 && messagesData?.hasMoreOld === true)
    }

    scrollContainer.addEventListener('scroll', handleScroll)
    return () => scrollContainer.removeEventListener('scroll', handleScroll)
  }, [messagesData?.hasMoreOld])

  // Reset scroll flags when conversation changes
  useEffect(() => {
    hasInitialScrolled.current = false
    isLoadingMoreRef.current = false
  }, [selectedConversation?.id])

  // Auto-scroll to bottom when conversation loads
  useEffect(() => {
    // Skip scroll if loading more messages or still loading
    if (isLoadingMoreRef.current || isLoadingMessages) {
      return
    }

    // Only proceed if messages loaded and haven't scrolled yet for this conversation
    if (messagesData?.messages && messagesData.messages.length > 0 && !hasInitialScrolled.current) {
      // Wait for DOM to be fully rendered before scrolling
      const scrollTimeout = setTimeout(() => {
        // Scroll to bottom
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'auto' })
          hasInitialScrolled.current = true
          console.log('📍 Scrolled to bottom')
        }
      }, 100)

      return () => clearTimeout(scrollTimeout)
    }
  }, [messagesData?.messages, selectedConversation?.id, isLoadingMessages])

  // Auto-scroll to bottom when new message arrives (after initial load)
  useEffect(() => {
    // Skip if no messages or loading more
    if (!messagesData?.messages || messagesData.messages.length === 0 || isLoadingMoreRef.current) {
      return
    }

    // Check if user is near bottom (within 200px) or already scrolled initially, or is sending message
    const scrollContainer = scrollContainerRef.current
    const shouldAutoScroll = isSendingMessageRef.current || hasInitialScrolled.current || (
      scrollContainer &&
      scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight < 200
    )

    if (shouldAutoScroll) {
      // Use triple RAF for smooth scroll after DOM paint
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            console.log('🔽 Auto-scroll to bottom on new message')
          })
        })
      })
    } else {
      console.log('⏸️ Skip auto-scroll: User scrolled up')
    }
  }, [messagesData?.messages.length]) // Only trigger when message count changes

  // Filtered conversations based on search
  let filteredConversations = conversations?.filter((conv) =>
    conv.patientName.toLowerCase().includes(search.trim().toLowerCase())
  ) || []

  // Đưa phòng đang chọn lên đầu
  if (selectedConversation?.id) {
    filteredConversations = [
      ...filteredConversations.filter(c => c.id === selectedConversation.id),
      ...filteredConversations.filter(c => c.id !== selectedConversation.id)
    ]
  }

  // Group messages by date
  const groupedMessages = messagesData?.messages.reduce(
    (acc: Record<string, Message[]>, message) => {
      const dateKey = format(new Date(message.sentTime), 'd MMM, yyyy', {
        locale: vi,
      })
      if (!acc[dateKey]) {
        acc[dateKey] = []
      }
      acc[dateKey].push(message)
      return acc
    },
    {}
  )

  // Handle send message
  const handleSendMessage = (e: FormEvent) => {
    e.preventDefault()

    if (!messageInput.trim() && imageUrls.length === 0) return
    if (!selectedConversation || !user) return

    const token = getAuthToken()
    if (!token) {
      console.error('No auth token found')
      return
    }

    // Mark that we're sending a message (to force scroll)
    isSendingMessageRef.current = true

    sendMessage(
      {
        conversationId: selectedConversation.id,
        senderId: user.id,
        message: messageInput.trim(),
        urls: imageUrls,
        token,
      },
      {
        onSuccess: () => {
          setMessageInput('')
          setImageUrls([])

          // Force scroll to bottom after optimistic update completes
          // Use setTimeout to ensure React has flushed state updates
          setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
            console.log('📤 Scrolled to bottom after sending message')
          }, 100)
        },
        onSettled: () => {
          // Reset flag after message is sent (success or error)
          setTimeout(() => {
            isSendingMessageRef.current = false
          }, 1000)
        },
      }
    )
  }

  // Handle load more messages
  const handleLoadMore = () => {
    if (
      !selectedConversation ||
      !messagesData?.messages.length ||
      !messagesData.hasMoreOld
    )
      return

    // Set flag to prevent auto-scroll when loading more
    isLoadingMoreRef.current = true

    // Save current scroll position before load
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    const scrollHeightBefore = scrollContainer.scrollHeight
    const scrollTopBefore = scrollContainer.scrollTop

    const oldestMessageId = messagesData.messages[0].id

    loadMoreMessages(
      {
        conversationId: selectedConversation.id,
        beforeId: oldestMessageId,
      },
      {
        onSuccess: () => {
          // Restore scroll position after new messages loaded với RAF để smooth
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (scrollContainer) {
                const scrollHeightAfter = scrollContainer.scrollHeight
                const heightDiff = scrollHeightAfter - scrollHeightBefore
                // Keep user at same visual position
                scrollContainer.scrollTop = scrollTopBefore + heightDiff

                // Reset flag AFTER scroll position restored
                // Delay thêm 1 frame để chắc chắn scroll đã xong
                requestAnimationFrame(() => {
                  isLoadingMoreRef.current = false
                })
              }
            })
          })
        },
        onError: () => {
          // Reset flag on error
          isLoadingMoreRef.current = false
        },
      }
    )
  }

  // Handle add image - open file picker and upload
  const handleAddImage = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true

    input.onchange = async (e: Event) => {
      const files = Array.from((e.target as HTMLInputElement).files || [])
      if (files.length === 0) return

      uploadImages(files, {
        onSuccess: (urls) => {
          console.log('✅ Images uploaded:', urls)
          setImageUrls([...imageUrls, ...urls])
        },
      })
    }

    input.click()
  }

  const removeImageUrl = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index))
  }

  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
        <Search />
        <HeaderActions />
      </Header>

      <Main fixed>
        <section className='flex h-full gap-6'>
          {/* Left Side - Conversation List */}
          <div className='flex w-full flex-col gap-2 sm:w-56 lg:w-72 2xl:w-80'>
            <div className='bg-background sticky top-0 z-10 -mx-4 px-4 pb-3 shadow-md sm:static sm:z-auto sm:mx-0 sm:p-0 sm:shadow-none'>
              <div className='flex items-center justify-between py-2'>
                <div className='flex gap-2'>
                  <h1 className='text-2xl font-bold'>Hộp thư</h1>
                  <MessagesSquare size={20} />
                </div>
              </div>

              <label
                className={cn(
                  'focus-within:ring-ring focus-within:ring-1 focus-within:outline-hidden',
                  'border-border flex h-10 w-full items-center space-x-0 rounded-md border ps-2'
                )}
              >
                <SearchIcon size={15} className='me-2 stroke-slate-500' />
                <span className='sr-only'>Tìm kiếm</span>
                <input
                  type='text'
                  className='w-full flex-1 bg-inherit text-sm focus-visible:outline-hidden'
                  placeholder='Tìm cuộc trò chuyện...'
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>

            <ScrollArea className='-mx-3 h-full overflow-scroll p-3'>
              {isLoadingConversations ? (
                <div className='space-y-2'>
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className='flex gap-2 p-2'>
                      <Skeleton className='h-10 w-10 rounded-full' />
                      <div className='flex-1 space-y-2'>
                        <Skeleton className='h-4 w-full' />
                        <Skeleton className='h-3 w-2/3' />
                      </div>
                    </div>
                  ))}
                </div>
              ) : filteredConversations && filteredConversations.length > 0 ? (
                filteredConversations.map((conversation) => (
                  <div key={conversation.id}>
                    <button
                      type='button'
                      className={cn(
                        'group hover:bg-accent hover:text-accent-foreground',
                        'flex w-full rounded-md px-2 py-2 text-start text-sm relative',
                        selectedConversation?.id === conversation.id &&
                        'sm:bg-muted'
                      )}
                      onClick={() => {
                        setSelectedConversation(conversation)
                        setMobileSelectedConversation(conversation)
                      }}
                    >
                      <div className='flex gap-2 flex-1'>
                        <Avatar>
                          <AvatarImage src='/avatars/patient.png' />
                          <AvatarFallback>
                            {conversation.patientName
                              .split('AVATAR')
                              .slice(-1)[0]
                              .charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className='flex-1 min-w-0'>
                          <div className='flex items-center justify-between gap-2'>
                            <span className='font-medium truncate'>
                              {conversation.patientName}
                            </span>
                            {/* Unread dot */}
                            {getUnreadCount(conversation.id) > 0 && (
                              <span className='ml-auto flex-shrink-0 bg-red-500 rounded-full w-2 h-2 block' />
                            )}
                          </div>
                          {getUnreadCount(conversation.id) > 0 ? (
                            <span className='text-red-500 text-xs truncate block'>Có tin nhắn mới</span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                    <Separator className='my-1' />
                  </div>
                ))
              ) : (
                <div className='text-center text-sm text-muted-foreground py-8'>
                  Không có cuộc trò chuyện nào
                </div>
              )}
            </ScrollArea>
          </div>

          {/* Right Side - Chat Window */}
          {selectedConversation ? (
            <div
              className={cn(
                'bg-background absolute inset-0 start-full z-50 hidden w-full flex-1 flex-col border shadow-xs sm:static sm:z-auto sm:flex sm:rounded-md',
                mobileSelectedConversation && 'start-0 flex'
              )}
            >
              {/* Top Part - Chat Header */}
              <div className='bg-primary text-primary-foreground mb-1 flex flex-none justify-between p-4 sm:rounded-t-md shadow-sm'>
                <div className='flex gap-3'>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='-ms-2 h-full sm:hidden hover:bg-primary-foreground/10'
                    onClick={() => setMobileSelectedConversation(null)}
                  >
                    <ArrowLeft className='rtl:rotate-180 text-primary-foreground' />
                  </Button>
                  <div className='flex items-center gap-2 lg:gap-4'>
                    <Avatar className='size-9 lg:size-11 ring-2 ring-primary-foreground/20'>
                      <AvatarImage src='/avatars/patient.png' />
                      <AvatarFallback className='bg-primary-foreground/20 text-primary-foreground'>
                        {selectedConversation.patientName
                          .split('AVATAR')
                          .slice(-1)[0]
                          .charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <span className='text-sm font-medium lg:text-base block text-primary-foreground'>
                        {selectedConversation.patientName}
                      </span>
                      <span className='text-primary-foreground/70 text-xs lg:text-sm'>
                        Bệnh nhân
                      </span>
                    </div>
                  </div>
                </div>

                <div className='-me-1 flex items-center gap-1 lg:gap-2'>
                  <Button
                    size='icon'
                    variant='ghost'
                    className='h-10 rounded-md sm:h-8 sm:w-4 lg:h-10 lg:w-6 hover:bg-primary-foreground/10'
                  >
                    <MoreVertical className='text-primary-foreground sm:size-5' />
                  </Button>
                </div>
              </div>

              {/* Chat Window Content */}
              <div className='flex flex-1 flex-col h-full overflow-hidden'>
                {/* Messages Area */}
                <div className='flex-1 min-h-0 flex flex-col px-4 pt-2'>
                  {isLoadingMessages ? (
                    <div className='flex h-full items-center justify-center'>
                      <Loader2 className='h-8 w-8 animate-spin' />
                    </div>
                  ) : (
                    <>
                      {/* Messages ScrollArea */}
                      <div
                        ref={scrollContainerRef}
                        className='flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent'
                        style={{
                          scrollbarWidth: 'thin',
                          scrollbarColor: 'hsl(var(--muted)) transparent'
                        }}
                      >
                        <div className='flex flex-col gap-2 py-2 pr-4'>
                          {/* Load More Button - Show khi scroll gần top */}
                          {showLoadMore && messagesData?.hasMoreOld && (
                            <div className='flex-shrink-0 text-center py-2'>
                              <Button
                                variant='ghost'
                                size='sm'
                                onClick={handleLoadMore}
                                disabled={isLoadingMore}
                              >
                                {isLoadingMore ? (
                                  <>
                                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                                    Đang tải...
                                  </>
                                ) : (
                                  'Tải thêm tin nhắn'
                                )}
                              </Button>
                            </div>
                          )}

                          {groupedMessages &&
                            Object.entries(groupedMessages).map(
                              ([dateKey, messages]) => (
                                <div key={dateKey}>
                                  {/* Date Divider */}
                                  <div className='text-center text-xs text-muted-foreground my-3'>
                                    {dateKey}
                                  </div>

                                  {/* Messages */}
                                  {messages.map((msg, msgIndex) => {
                                    const isOwnMessage = msg.senderId === user?.id

                                    return (
                                      <div key={msg.id || msgIndex}>
                                        <div
                                          className={cn(
                                            'mb-2 flex flex-col',
                                            isOwnMessage
                                              ? 'items-end'
                                              : 'items-start'
                                          )}
                                        >
                                          {/* Container cho message - tách ảnh và text thành 2 bubble riêng */}
                                          <div className='flex flex-col gap-1 max-w-[70%]'>
                                            {/* Bubble 1: Chỉ ảnh */}
                                            {msg.urls && msg.urls.length > 0 && (
                                              <div
                                                className={cn(
                                                  'overflow-hidden rounded-2xl shadow-sm',
                                                  // Giới hạn kích thước ảnh để nhỏ hơn
                                                  msg.urls.length === 1 ? 'w-[200px]' : 'w-[280px]',
                                                  isOwnMessage
                                                    ? 'bg-primary rounded-br-sm'
                                                    : 'bg-muted rounded-bl-sm'
                                                )}
                                              >
                                                <div className={cn(
                                                  'grid gap-0.5',
                                                  msg.urls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                                                )}>
                                                  {msg.urls.map((url, idx) => (
                                                    <div
                                                      key={idx}
                                                      className='relative aspect-square overflow-hidden cursor-pointer hover:opacity-90 transition-opacity'
                                                      onClick={() => setSelectedImage(url)}
                                                    >
                                                      <img
                                                        src={url}
                                                        alt={`Image ${idx + 1}`}
                                                        className='w-full h-full object-cover'
                                                      />
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            )}

                                            {/* Bubble 2: Chỉ text (nếu có) - width tự động theo nội dung */}
                                            {msg.message && (
                                              <div
                                                className={cn(
                                                  'inline-block rounded-2xl shadow-sm px-4 py-2 w-fit',
                                                  isOwnMessage
                                                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                                                    : 'bg-muted rounded-bl-sm'
                                                )}
                                              >
                                                <p className='break-words text-sm'>
                                                  {msg.message}
                                                </p>
                                              </div>
                                            )}
                                          </div>

                                          {/* Timestamp - ngoài bubble */}
                                          <span
                                            className={cn(
                                              'block text-xs opacity-70 mt-0.5',
                                              isOwnMessage
                                                ? 'text-right'
                                                : 'text-left'
                                            )}
                                          >
                                            {format(
                                              new Date(msg.sentTime),
                                              'HH:mm'
                                            )}
                                          </span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )
                            )}
                          <div ref={messagesEndRef} />
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Message Input - Cố định ở dưới */}
                <div className='flex-shrink-0 border-t bg-background p-4'>
                  <form
                    onSubmit={handleSendMessage}
                    className='flex flex-col gap-2'
                  >
                    {/* Image URLs Preview */}
                    {imageUrls.length > 0 && (
                      <div className='flex gap-2 flex-wrap p-2 border rounded-md'>
                        {imageUrls.map((url, idx) => (
                          <div key={idx} className='relative group'>
                            <img
                              src={url}
                              alt={`Preview ${idx}`}
                              className='h-20 w-20 object-cover rounded'
                            />
                            <button
                              type='button'
                              onClick={() => removeImageUrl(idx)}
                              className='absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity'
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Input Row */}
                    <div className='flex gap-2 items-center'>
                      <Button
                        type='button'
                        size='icon'
                        variant='outline'
                        onClick={handleAddImage}
                        disabled={isSendingMessage || isUploadingImages}
                      >
                        {isUploadingImages ? (
                          <Loader2 size={20} className='animate-spin' />
                        ) : (
                          <ImagePlus size={20} />
                        )}
                      </Button>

                      <Input
                        type='text'
                        placeholder='Nhập tin nhắn...'
                        value={messageInput}
                        onChange={(e) => setMessageInput(e.target.value)}
                        disabled={isSendingMessage}
                        className='flex-1'
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSendMessage(e as any)
                          }
                        }}
                      />

                      <Button
                        type='submit'
                        disabled={
                          isSendingMessage ||
                          (!messageInput.trim() && imageUrls.length === 0)
                        }
                      >
                        {isSendingMessage ? (
                          <Loader2 className='h-5 w-5 animate-spin' />
                        ) : (
                          <Send size={20} />
                        )}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          ) : (
            // Empty State
            <div
              className={cn(
                'bg-card absolute inset-0 start-full z-50 hidden w-full flex-1 flex-col justify-center rounded-md border shadow-xs sm:static sm:z-auto sm:flex'
              )}
            >
              <div className='flex flex-col items-center space-y-6'>
                <div className='border-border flex size-16 items-center justify-center rounded-full border-2'>
                  <MessagesSquare className='size-8' />
                </div>
                <div className='space-y-2 text-center'>
                  <h1 className='text-xl font-semibold'>Tin nhắn của bạn</h1>
                  <p className='text-muted-foreground text-sm'>
                    Chọn một cuộc trò chuyện để bắt đầu.
                  </p>
                </div>
              </div>
            </div>
          )}
        </section>
      </Main>

      {/* Image Modal */}
      <ImageModal imageUrl={selectedImage} onClose={() => setSelectedImage(null)} />
    </>
  )
}
