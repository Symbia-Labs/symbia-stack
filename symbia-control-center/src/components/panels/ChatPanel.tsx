/**
 * Chat Panel
 *
 * Real-time messaging with conversations and AI assistants.
 * Supports @mentions to invite assistants into conversations.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { Bubble, GroupTimestamp } from '@/components/chat/Bubble';
import type { Skin } from '@/components/chat/skins';
import { useMessaging } from '@/hooks/useMessaging';
import { useAuth } from '@/hooks/useAuth';
import type { Message } from '@/stores/messagingStore';
import {
  messagingBridge,
  joinConversation,
  leaveConversation,
  startTyping,
  stopTyping,
} from '@/services/messagingBridge';
import { assistantsClient } from '@/services/assistantsClient';
import { getRefSuggestions, SymbiaNamespace } from '@symbia/sys';

// Symbia Script reference suggestion
interface RefSuggestion {
  value: string;
  description: string;
  namespace?: string;
}

interface MentionableAssistant {
  alias: string;
  name: string;
  principalId: string;
  key: string;
}

// The local MessageBubble that lived here was removed 6 Aug 2026. It was one
// of THREE implementations of a message bubble in this app -- this one,
// components/messaging/MessageBubble.tsx, and whatever the popout would have
// grown. All rendering now goes through components/chat/Bubble.tsx, which is
// skin-aware. A shared concern with N implementations is not shared.

function TypingIndicator({ users }: { users: string[] }) {
  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 text-xs text-slate-500">
      <div className="flex gap-1">
        <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="w-1.5 h-1.5 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span>
        {users.length === 1 ? 'Someone is' : `${users.length} people are`} typing...
      </span>
    </div>
  );
}

function AssistantRespondingIndicator({ assistantName }: { assistantName: string }) {
  return (
    <div className="flex justify-start">
      <div className="max-w-[75%] rounded-lg px-4 py-2 bg-scc-secondary/20 border border-scc-secondary/30">
        <p className="text-xs font-medium mb-1 text-scc-secondary">{assistantName}</p>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 bg-scc-secondary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 bg-scc-secondary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 bg-scc-secondary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
          <span className="text-sm text-slate-400">Responding...</span>
        </div>
      </div>
    </div>
  );
}

// Generic processing indicator shown when coordinator is silently routing
function ProcessingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-lg px-4 py-2 bg-slate-800/50 border border-slate-700/30">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MentionDropdown({
  assistants,
  selectedIndex,
  onSelect,
  position,
}: {
  assistants: MentionableAssistant[];
  selectedIndex: number;
  onSelect: (assistant: MentionableAssistant) => void;
  position: { top: number; left: number };
}) {
  if (assistants.length === 0) return null;

  return (
    <div
      className="absolute z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[200px]"
      style={{ bottom: position.top, left: position.left }}
    >
      <div className="px-2 py-1 text-xs text-slate-500 border-b border-slate-700">
        Mention an assistant
      </div>
      {assistants.map((assistant, index) => (
        <button
          key={assistant.key}
          onClick={() => onSelect(assistant)}
          className={`
            w-full text-left px-3 py-2 text-sm flex items-center gap-2
            ${index === selectedIndex
              ? 'bg-scc-primary/20 text-slate-100'
              : 'text-slate-300 hover:bg-slate-700'
            }
          `}
        >
          <span className="text-scc-secondary font-medium">@{assistant.alias}</span>
          <span className="text-slate-500">{assistant.name}</span>
        </button>
      ))}
    </div>
  );
}

// Get color class for namespace
function getNamespaceBadgeColor(namespace: string): string {
  switch (namespace) {
    case SymbiaNamespace.CONTEXT:
      return 'bg-blue-400/10 text-blue-400';
    case SymbiaNamespace.MESSAGE:
      return 'bg-emerald-400/10 text-emerald-400';
    case SymbiaNamespace.USER:
      return 'bg-cyan-400/10 text-cyan-400';
    case SymbiaNamespace.ORG:
      return 'bg-purple-400/10 text-purple-400';
    case SymbiaNamespace.SERVICE:
      return 'bg-orange-400/10 text-orange-400';
    case SymbiaNamespace.INTEGRATION:
      return 'bg-pink-400/10 text-pink-400';
    case SymbiaNamespace.VAR:
      return 'bg-yellow-400/10 text-yellow-400';
    case SymbiaNamespace.ENV:
      return 'bg-red-400/10 text-red-400';
    default:
      return 'bg-slate-400/10 text-slate-400';
  }
}

function RefSuggestionDropdown({
  suggestions,
  selectedIndex,
  onSelect,
  position,
}: {
  suggestions: RefSuggestion[];
  selectedIndex: number;
  onSelect: (suggestion: RefSuggestion) => void;
  position: { top: number; left: number };
}) {
  if (suggestions.length === 0) return null;

  return (
    <div
      className="absolute z-50 bg-slate-800 border border-slate-600 rounded-lg shadow-xl py-1 min-w-[280px] max-h-64 overflow-y-auto"
      style={{ bottom: position.top, left: position.left }}
    >
      <div className="px-2 py-1 text-xs text-slate-500 border-b border-slate-700">
        Symbia Script Reference
      </div>
      {suggestions.map((suggestion, index) => {
        const namespace = suggestion.value.match(/@([a-zA-Z]+)/)?.[1];
        return (
          <button
            key={suggestion.value}
            onClick={() => onSelect(suggestion)}
            className={`
              w-full text-left px-3 py-2 text-sm
              ${index === selectedIndex
                ? 'bg-scc-primary/20 text-slate-100'
                : 'text-slate-300 hover:bg-slate-700'
              }
            `}
          >
            <div className="flex items-center gap-2">
              {namespace && (
                <span className={`px-1.5 py-0.5 text-xs font-mono rounded ${getNamespaceBadgeColor(namespace)}`}>
                  @{namespace}
                </span>
              )}
              <span className="font-mono text-sm">
                {suggestion.value.replace(/^@[a-zA-Z]+\.?/, '')}
              </span>
            </div>
            {suggestion.description && (
              <p className="text-xs text-slate-500 mt-0.5 pl-0.5">
                {suggestion.description}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Chat, rendered inside the phone-shaped popout (components/chat/ChatWindow).
 *
 * The window owns the frame, the title and the connection status, so this
 * renders only the conversation surface and the composer. It no longer draws
 * its own header — two headers was the first thing that looked wrong when the
 * panel was dropped into the window.
 */
export function ChatPanel({ skin }: { skin: Skin }) {
  const { user } = useAuth();
  const {
    conversations,
    connectionStatus,
    loadConversations,
    loadMessages,
    sendMessage,
    getConversationMessages,
    getTypingUsers: getTypingUsersFromHook,
  } = useMessaging();

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const prevMessageCountRef = useRef(0);
  const isUserScrollingRef = useRef(false);

  // @mention state (for assistants)
  const [mentionableAssistants, setMentionableAssistants] = useState<MentionableAssistant[]>([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null);

  // Symbia Script reference state
  const [showRefDropdown, setShowRefDropdown] = useState(false);
  const [refSuggestions, setRefSuggestions] = useState<RefSuggestion[]>([]);
  const [refSelectedIndex, setRefSelectedIndex] = useState(0);
  const [refStartPos, setRefStartPos] = useState<number | null>(null);

  // Catalog data for dynamic autocomplete
  const [catalogData, setCatalogData] = useState<{ resources: any[] } | null>(null);

  // Track assistants that are currently responding
  const [respondingAssistants, setRespondingAssistants] = useState<Set<string>>(new Set());
  // Set when the wait elapses with no reply. NOT the same as "not responding":
  // this records that we asked, waited, and got nothing -- which is a fact
  // worth showing, and the thing an endless typing indicator hides.
  const [stalled, setStalled] = useState<string | null>(null);

  const conversationMessages = selectedConversationId ? getConversationMessages(selectedConversationId) : [];
  const typingUsers = selectedConversationId ? getTypingUsersFromHook(selectedConversationId) : [];

  // Filter mentionable assistants based on query
  const filteredMentions = mentionableAssistants.filter(
    (a) => a.alias.toLowerCase().includes(mentionQuery.toLowerCase()) ||
           a.name.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  // Load conversations and mentionable assistants on mount
  useEffect(() => {
    loadConversations();

    // Load mentionable assistants
    assistantsClient.getMentionable()
      .then(setMentionableAssistants)
      .catch((err) => console.error('Failed to load mentionable assistants:', err));
  }, [loadConversations]);

  // Join/leave conversation rooms - also re-join when connection is established
  useEffect(() => {
    if (!selectedConversationId) return;

    const doJoin = async () => {
      // Only try to join if we're connected
      if (connectionStatus === 'connected') {
        const joined = await joinConversation(selectedConversationId);
        if (!joined) {
          console.warn('[Chat] Failed to join conversation room:', selectedConversationId);
        } else {
          console.log('[Chat] Joined conversation room:', selectedConversationId);
        }
      }
      // Always load messages (via REST) regardless of socket status
      loadMessages(selectedConversationId);
    };

    doJoin();

    return () => {
      if (connectionStatus === 'connected') {
        leaveConversation(selectedConversationId);
      }
    };
  }, [selectedConversationId, connectionStatus, loadMessages]);

  // Scroll to bottom on new messages (only if user is near bottom)
  useEffect(() => {
    const container = messagesContainerRef.current;
    const messageCount = conversationMessages.length;

    // Only auto-scroll if:
    // 1. There are new messages (count increased)
    // 2. User is not actively scrolling
    // 3. User is already near the bottom (within 150px)
    if (messageCount > prevMessageCountRef.current && container && !isUserScrollingRef.current) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
      if (isNearBottom || prevMessageCountRef.current === 0) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }

    prevMessageCountRef.current = messageCount;
  }, [conversationMessages]);

  // Clear responding state when we receive messages from assistants
  useEffect(() => {
    if (conversationMessages.length === 0 || respondingAssistants.size === 0) return;

    // Check the most recent messages for assistant responses
    const recentMessages = conversationMessages.slice(-5);
    const respondedAssistants = new Set<string>();

    for (const msg of recentMessages) {
      if (msg.sender_type === 'agent') {
        // Clear this assistant if they were in the responding set
        if (respondingAssistants.has(msg.sender_id)) {
          respondedAssistants.add(msg.sender_id);
        }
        // Also clear coordinator if ANY assistant responds
        // (coordinator routes silently to other assistants)
        if (respondingAssistants.has('assistant:coordinator')) {
          respondedAssistants.add('assistant:coordinator');
        }
      }
    }

    if (respondedAssistants.size > 0) {
      setStalled(null);
      setRespondingAssistants(prev => {
        const next = new Set(prev);
        respondedAssistants.forEach(id => next.delete(id));
        return next;
      });
    }
  }, [conversationMessages, respondingAssistants]);

  // Track if we've already generated a topic name for this conversation
  const topicNameGeneratedRef = useRef<Set<string>>(new Set());

  // Auto-update topic name once when conversation has user messages
  useEffect(() => {
    if (!selectedConversationId) return;

    const conversation = conversations.find(c => c.id === selectedConversationId);
    if (!conversation) return;

    // Skip if already has a real name or we already tried generating one
    if (conversation.name && conversation.name !== 'New Topic') return;
    if (topicNameGeneratedRef.current.has(selectedConversationId)) return;

    // Need at least one user message to generate a meaningful name
    const hasUserMessage = conversationMessages.some(m => m.sender_type === 'user');
    if (!hasUserMessage) return;

    // Mark that we're attempting to generate a name
    topicNameGeneratedRef.current.add(selectedConversationId);
    console.log('[Chat] Generating topic name for conversation:', selectedConversationId);

    const updateTopicName = async () => {
      try {
        const topicName = await messagingBridge.generateTopicName(selectedConversationId);
        console.log('[Chat] Generated topic name:', topicName);
        if (topicName && topicName !== 'New Topic') {
          await messagingBridge.updateConversation(selectedConversationId, { name: topicName });
          // Reload conversations to get the updated name
          loadConversations();
        }
      } catch (error) {
        console.error('[Chat] Topic name update failed:', error);
        // Remove from set so we can retry later
        topicNameGeneratedRef.current.delete(selectedConversationId);
      }
    };

    // Generate topic name after a short delay
    const timeout = setTimeout(updateTopicName, 2000);

    return () => {
      clearTimeout(timeout);
    };
  }, [selectedConversationId, conversations, conversationMessages, loadConversations]);

  // Parse @mentions from message content
  const parseMentions = useCallback((content: string): MentionableAssistant[] => {
    const mentionRegex = /@(\w+)/g;
    const mentions: MentionableAssistant[] = [];
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      const alias = match[1].toLowerCase();
      const assistant = mentionableAssistants.find(a => a.alias.toLowerCase() === alias);
      if (assistant && !mentions.find(m => m.key === assistant.key)) {
        mentions.push(assistant);
      }
    }

    return mentions;
  }, [mentionableAssistants]);

  // Add mentioned assistants as participants
  const addMentionedParticipants = useCallback(async (
    conversationId: string,
    mentions: MentionableAssistant[]
  ) => {
    for (const assistant of mentions) {
      try {
        await messagingBridge.addParticipant(conversationId, assistant.principalId, 'agent');
        console.log(`Added @${assistant.alias} (${assistant.principalId}) to conversation`);
      } catch (error) {
        // Participant might already exist - that's ok
        console.warn(`Could not add @${assistant.alias} to conversation:`, error);
      }
    }
  }, []);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isSending) return;

    setIsSending(true);
    setShowMentionDropdown(false);

    try {
      // Auto-create a new topic if no conversation is selected
      let conversationId = selectedConversationId;
      if (!conversationId) {
        conversationId = await createNewTopic();
        if (!conversationId) {
          throw new Error('Failed to create conversation');
        }
      }

      stopTyping(conversationId);

      // Parse @mentions and add participants before sending
      const mentions = parseMentions(inputValue);
      if (mentions.length > 0) {
        await addMentionedParticipants(conversationId, mentions);
        // Mark these assistants as "responding"
        const newResponding = new Set(mentions.map(m => m.principalId));
        setRespondingAssistants(newResponding);
      } else {
        // No explicit @mention - Coordinator will respond
        // Add coordinator as participant so it receives the message via SDN
        try {
          await messagingBridge.addParticipant(conversationId, 'assistant:coordinator', 'agent');
          console.log('[Chat] Added coordinator to conversation for default routing');
        } catch (error) {
          // Coordinator might already be a participant - that's ok
          console.debug('[Chat] Coordinator participant add result:', error);
        }
        setRespondingAssistants(new Set(['assistant:coordinator']));
      }

      const result = await sendMessage(conversationId, inputValue.trim());

      if (result) {
        console.log('[Chat] Message sent successfully:', result.id);
        setInputValue('');
        inputRef.current?.focus();

        // If nothing comes back, SAY SO.
        //
        // This used to spin the typing indicator for 60s and then silently
        // clear it, so a failed assistant looked first like one that was
        // thinking and then like one that had never been asked. Both are
        // untrue. Measured 7 Aug: the assistants service logged
        // "No openai API key configured" within a second of delivery while
        // the window showed three animated dots indefinitely.
        setTimeout(() => {
          setRespondingAssistants(prev => {
            if (prev.size > 0) {
              setStalled('No reply. The message was delivered and the assistant was reached, but it did not respond.');
              return new Set();
            }
            return prev;
          });
        }, 30000);
      } else {
        console.error('[Chat] Message send returned null - both WebSocket and REST failed');
        setStalled('Message not sent. Both the socket and the REST fallback failed.');
        // Don't clear responding immediately - the user might want to retry
        // Set a shorter timeout instead
        setTimeout(() => {
          setRespondingAssistants(new Set());
        }, 5000);
      }
    } catch (error) {
      console.error('[Chat] Failed to send message:', error);
      setStalled(`Message not sent. ${error instanceof Error ? error.message : String(error)}`);
      // Don't clear responding immediately - give some time for user to see the error
      setTimeout(() => {
        setRespondingAssistants(new Set());
      }, 5000);
    } finally {
      setIsSending(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInputValue(value);

    // Detect @mention or @reference
    const textBeforeCursor = value.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@([a-zA-Z0-9_./?&=%-]*)$/);

    if (atMatch) {
      const query = atMatch[1];
      const startPos = cursorPos - atMatch[0].length;

      // Known Symbia Script namespaces
      const namespaces = ['context', 'message', 'user', 'org', 'service', 'integration', 'var', 'env'];

      // Check if this looks like a Symbia Script reference (contains . or matches namespace prefix)
      const hasNamespaceDot = query.includes('.');
      const matchesNamespace = namespaces.some(ns => ns.startsWith(query.toLowerCase()));
      const isScriptRef = hasNamespaceDot || (matchesNamespace && query.length > 0);

      // Check if this could be an assistant mention
      const matchesAssistant = mentionableAssistants.some(
        a => a.alias.toLowerCase().startsWith(query.toLowerCase())
      );

      if (isScriptRef && !matchesAssistant) {
        // Lazy load catalog if they're typing @catalog
        if (query.startsWith('catalog') && !catalogData) {
          fetch('http://localhost:4001/symbia-namespace')
            .then(res => res.json())
            .then(data => setCatalogData({ resources: data.resources || [] }))
            .catch((err) => console.error('Failed to load catalog:', err));
        }

        // Show Symbia Script reference suggestions with catalog context
        const refContext = catalogData ? { catalog: catalogData } : undefined;
        const suggestions = getRefSuggestions('@' + query, refContext).map(s => ({
          ...s,
          namespace: s.value.match(/@([a-zA-Z]+)/)?.[1],
        }));
        setRefSuggestions(suggestions);
        setShowRefDropdown(suggestions.length > 0);
        setRefStartPos(startPos);
        setRefSelectedIndex(0);
        setShowMentionDropdown(false);
      } else if (matchesAssistant || query === '') {
        // Show assistant mention dropdown
        setShowMentionDropdown(true);
        setMentionQuery(query);
        setMentionStartPos(startPos);
        setMentionSelectedIndex(0);
        setShowRefDropdown(false);
      } else {
        // No matches - hide both
        setShowMentionDropdown(false);
        setShowRefDropdown(false);
      }
    } else {
      setShowMentionDropdown(false);
      setShowRefDropdown(false);
      setMentionQuery('');
      setMentionStartPos(null);
      setRefStartPos(null);
    }

    if (selectedConversationId) {
      startTyping(selectedConversationId);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      // Stop typing after 3 seconds of no input (increased from 2s to reduce flicker)
      typingTimeoutRef.current = setTimeout(() => {
        stopTyping(selectedConversationId);
      }, 3000);
    }
  };

  const handleMentionSelect = (assistant: MentionableAssistant) => {
    if (mentionStartPos === null) return;

    const before = inputValue.slice(0, mentionStartPos);
    const after = inputValue.slice(mentionStartPos + mentionQuery.length + 1); // +1 for @
    const newValue = `${before}@${assistant.alias} ${after}`;

    setInputValue(newValue);
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionStartPos(null);
    inputRef.current?.focus();
  };

  const handleRefSelect = (suggestion: RefSuggestion) => {
    if (refStartPos === null) return;

    const before = inputValue.slice(0, refStartPos);
    // Find where the current ref ends
    const textAfterStart = inputValue.slice(refStartPos);
    const refEndMatch = textAfterStart.match(/^@[a-zA-Z0-9_./?&=%-]*/);
    const refLength = refEndMatch ? refEndMatch[0].length : 0;
    const after = inputValue.slice(refStartPos + refLength);

    // If suggestion ends with ., don't add space (user is drilling down)
    const suffix = suggestion.value.endsWith('.') ? '' : ' ';
    const newValue = `${before}${suggestion.value}${suffix}${after}`;

    setInputValue(newValue);
    setShowRefDropdown(false);
    setRefStartPos(null);
    setRefSuggestions([]);

    // Set cursor position after the inserted ref
    const newCursorPos = refStartPos + suggestion.value.length + suffix.length;
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle assistant mention dropdown
    if (showMentionDropdown && filteredMentions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev + 1) % filteredMentions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionSelectedIndex((prev) => (prev - 1 + filteredMentions.length) % filteredMentions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleMentionSelect(filteredMentions[mentionSelectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowMentionDropdown(false);
        return;
      }
    }

    // Handle Symbia Script reference dropdown
    if (showRefDropdown && refSuggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setRefSelectedIndex((prev) => (prev + 1) % refSuggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setRefSelectedIndex((prev) => (prev - 1 + refSuggestions.length) % refSuggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleRefSelect(refSuggestions[refSelectedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowRefDropdown(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Auto-create a new conversation (called on first message when no conversation selected)
  const createNewTopic = useCallback(async (): Promise<string | null> => {
    try {
      // Create conversation with Coordinator as the default assistant
      // Name is temporary - Coordinator will update it based on conversation content
      const conversation = await messagingBridge.createConversation({
        type: 'private',
        name: 'New Topic',
        participants: [{ userId: 'assistant:coordinator', userType: 'agent' }],
      });
      loadConversations();
      setSelectedConversationId(conversation.id);
      return conversation.id;
    } catch (error) {
      console.error('Failed to create conversation:', error);
      return null;
    }
  }, [loadConversations]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3"
          onScroll={() => {
            // Mark user as scrolling, clear after 150ms of no scroll events
            isUserScrollingRef.current = true;
            setTimeout(() => { isUserScrollingRef.current = false; }, 150);
          }}
        >
          {conversationMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              <div className="text-center">
                <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-[18px] font-medium text-white/85">What can I help you with?</p>
                <p className="text-[16px] text-white/45 mt-2 px-6">
                  Just ask a question and I'll connect you with the right assistant
                </p>
              </div>
            </div>
          ) : (
            <>
              {conversationMessages.map((msg: Message, i: number) => {
                const prev = conversationMessages[i - 1];
                const startsGroup = !prev || prev.sender_id !== msg.sender_id;
                // iMessage prints one timestamp above a run rather than one per
                // bubble; the gap between messages is where it belongs.
                const gap =
                  !prev ||
                  new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60_000;
                return (
                  <div key={msg.id}>
                    {gap && <GroupTimestamp iso={msg.created_at} skin={skin} />}
                    <Bubble
                      message={msg}
                      isOwn={msg.sender_id === user?.id}
                      skin={skin}
                      startsGroup={startsGroup}
                    />
                  </div>
                );
              })}
              {/* Show responding indicators for assistants that are processing */}
              {(() => {
                // Filter out coordinator - it's a silent orchestrator
                const visibleResponding = Array.from(respondingAssistants)
                  .filter(id => !id.includes('coordinator'));

                // If only coordinator is responding, show generic processing indicator
                if (visibleResponding.length === 0 && respondingAssistants.size > 0) {
                  return <ProcessingIndicator key="processing" />;
                }

                // Otherwise show specific assistant indicators
                return visibleResponding.map(assistantId => {
                  const assistant = mentionableAssistants.find(a => a.principalId === assistantId);
                  return (
                    <AssistantRespondingIndicator
                      key={`responding-${assistantId}`}
                      assistantName={assistant?.name || assistantId.replace('assistant:', '').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                    />
                  );
                });
              })()}
              {stalled && (
                <div className="flex justify-center px-4 py-3">
                  <div className="max-w-[90%] rounded-[14px] border border-amber-500/35 bg-amber-500/10 px-4 py-2.5">
                    <p className="text-[15px] text-amber-200/90">{stalled}</p>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Typing indicator */}
        <TypingIndicator users={typingUsers} />

        {/* Input - always visible */}
        <div className={`shrink-0 p-3 relative z-10 ${skin.input.bar}`}>
          {/* @mention dropdown */}
          {showMentionDropdown && filteredMentions.length > 0 && (
            <MentionDropdown
              assistants={filteredMentions}
              selectedIndex={mentionSelectedIndex}
              onSelect={handleMentionSelect}
              position={{ top: 60, left: 16 }}
            />
          )}

          {/* Symbia Script reference dropdown */}
          {showRefDropdown && refSuggestions.length > 0 && (
            <RefSuggestionDropdown
              suggestions={refSuggestions}
              selectedIndex={refSelectedIndex}
              onSelect={handleRefSelect}
              position={{ top: 60, left: 16 }}
            />
          )}

          <div className="flex gap-2 items-end">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Message"
              rows={1}
              className={`flex-1 resize-none min-h-[44px] max-h-[96px] overflow-y-auto outline-none ${skin.input.field}`}
              disabled={connectionStatus !== 'connected'}
              autoFocus
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isSending || connectionStatus !== 'connected'}
              className={`
                w-11 h-11 grid place-items-center font-medium transition-all shrink-0 self-end
                ${inputValue.trim() && !isSending && connectionStatus === 'connected'
                  ? skin.input.send
                  : `${skin.input.sendIdle} cursor-not-allowed`
                }
              `}
            >
              {isSending ? (
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              )}
            </button>
          </div>
        </div>
    </div>
  );
}
