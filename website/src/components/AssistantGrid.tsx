import { useState, useRef, useEffect } from 'react';
import type { AssistantResource } from '@symbia/catalog-client';
import { useChat, type ChatMessage, type RuleDecision } from '../hooks/useSymbia';
import { RuleSetViewer, type RuleSet } from './RuleSetViewer';

interface AssistantGridProps {
  assistants: AssistantResource[];
  loading: boolean;
  connected: boolean;
}


// Color palette for aliases (matching Control Center)
const ALIAS_COLORS = [
  'var(--primary)',
  'var(--secondary)',
  'var(--tertiary)',
  'var(--node-input)',
  'var(--node-condition)',
  '#a78bfa', // purple
  '#f472b6', // pink
  '#34d399', // emerald
];

function getAliasColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  return ALIAS_COLORS[Math.abs(hash) % ALIAS_COLORS.length];
}

export function AssistantGrid({ assistants: liveAssistants, loading, connected }: AssistantGridProps) {
  const [selectedAssistant, setSelectedAssistant] = useState<string | null>(null);

  // Map live catalog data to display format
  const assistants = liveAssistants.map(a => {
    const meta = a.metadata as Record<string, unknown> | undefined;
    const ruleSet = meta?.ruleSet as RuleSet | undefined;
    const assistantConfig = meta?.assistantConfig as { capabilities?: string[] } | undefined;

    return {
      key: a.key,
      name: a.name || a.key.split('/').pop() || a.key,
      alias: `@${(meta?.alias as string) || a.key.split('/').pop() || a.key}`,
      icon: '🤖',
      status: a.status === 'published' ? 'published' : 'bootstrap',
      description: a.description || '',
      routines: ruleSet?.rules?.length || 0,
      capabilities: assistantConfig?.capabilities?.length || 0,
      // Full data for detail view
      ruleSet: ruleSet || null,
      capabilityList: assistantConfig?.capabilities || [],
    };
  });

  return (
    <div>
      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          Loading assistants from catalog...
        </div>
      )}

      {/* Not connected state */}
      {!loading && !connected && (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          Start Symbia platform to load assistants
        </div>
      )}

      {/* Empty state */}
      {!loading && connected && liveAssistants.length === 0 && (
        <div style={{ textAlign: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
          No assistants found in catalog
        </div>
      )}

      {/* Grid - 3 columns like Control Center */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 'var(--space-4)',
      }}>
        {assistants.map(assistant => (
          <AssistantCard
            key={assistant.key}
            assistant={assistant}
            selected={selectedAssistant === assistant.key}
            onClick={() => setSelectedAssistant(
              selectedAssistant === assistant.key ? null : assistant.key
            )}
          />
        ))}
      </div>

      {/* Detail Modal */}
      {selectedAssistant && (
        <AssistantDetailModal
          assistant={assistants.find(a => a.key === selectedAssistant)!}
          onClose={() => setSelectedAssistant(null)}
        />
      )}

      {/* Source indicator */}
      <div style={{
        textAlign: 'center',
        marginTop: 'var(--space-6)',
        fontSize: 12,
        color: 'var(--text-muted)',
      }}>
        {connected
          ? `${liveAssistants.length} assistants from catalog`
          : 'Connect to Symbia platform to load assistants'}
      </div>
    </div>
  );
}

interface AssistantData {
  key: string;
  name: string;
  alias: string;
  icon: string;
  status: string;
  description: string;
  routines: number;
  capabilities: number;
  ruleSet: RuleSet | null;
  capabilityList: string[];
}

interface AssistantCardProps {
  assistant: AssistantData;
  selected?: boolean;
  onClick?: () => void;
}

function AssistantCard({ assistant, selected, onClick }: AssistantCardProps) {
  const aliasColor = getAliasColor(assistant.key);

  return (
    <div
      onClick={onClick}
      style={{
        padding: 'var(--space-4)',
        background: selected ? 'var(--bg-muted)' : 'var(--bg-elevated)',
        borderRadius: 'var(--radius-lg)',
        border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        transform: selected ? 'translateY(-2px)' : 'none',
        boxShadow: selected ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'var(--primary)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.transform = 'translateY(0)';
        }
      }}
    >
      {/* Header: health dot + name + alias */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--node-input)',
              boxShadow: '0 0 6px var(--node-input)',
              flexShrink: 0,
            }}
          />
          <span style={{ fontWeight: 600, fontSize: 14 }}>{assistant.name}</span>
        </div>
        <span style={{
          fontSize: 13,
          fontFamily: 'var(--font-mono)',
          color: aliasColor,
          fontWeight: 500,
        }}>
          {assistant.alias}
        </span>
      </div>

      {/* Description */}
      <div style={{
        fontSize: 13,
        color: 'var(--text-secondary)',
        lineHeight: 1.5,
        marginBottom: 'var(--space-3)',
        minHeight: 40,
      }}>
        {assistant.description || 'No description'}
      </div>

      {/* Footer: stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {assistant.routines} rules
        </span>
        <span style={{
          padding: '2px 8px',
          borderRadius: 'var(--radius-sm)',
          fontSize: 10,
          fontWeight: 600,
          background: assistant.status === 'published'
            ? 'rgba(34, 197, 94, 0.15)'
            : 'rgba(234, 179, 8, 0.15)',
          color: assistant.status === 'published'
            ? 'var(--node-input)'
            : 'var(--node-condition)',
        }}>
          {assistant.status}
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {assistant.capabilities} capabilities
        </span>
      </div>
    </div>
  );
}

interface AssistantDetailModalProps {
  assistant: AssistantData;
  onClose: () => void;
}

function AssistantDetailModal({ assistant, onClose }: AssistantDetailModalProps) {
  const aliasColor = getAliasColor(assistant.key);
  const aliasName = assistant.alias.replace('@', '');
  const { messages, isStreaming, sendMessage, clearMessages } = useChat(aliasName);
  const [inputValue, setInputValue] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'rules'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clear messages when modal opens for a new assistant
  useEffect(() => {
    clearMessages();
  }, [assistant.key, clearMessages]);

  const handleSend = () => {
    if (!inputValue.trim() || isStreaming) return;
    sendMessage(inputValue.trim());
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 'var(--space-4)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border)',
          maxWidth: 600,
          width: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <span style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'var(--node-input)',
              boxShadow: '0 0 8px var(--node-input)',
            }} />
            <span style={{ fontSize: 16, fontWeight: 600 }}>{assistant.name}</span>
            <span style={{
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
              color: aliasColor,
              fontWeight: 500,
            }}>
              {assistant.alias}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 4,
            }}
          >
            ×
          </button>
        </div>

        {/* Info Section */}
        <div style={{
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-muted)',
          flexShrink: 0,
        }}>
          <div style={{
            fontSize: 13,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            marginBottom: 'var(--space-3)',
          }}>
            {assistant.description || 'No description available.'}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-4)', fontSize: 12, color: 'var(--text-muted)' }}>
            <span>{assistant.routines} rules</span>
            <span>{assistant.capabilities} capabilities</span>
            <span style={{
              color: assistant.status === 'published' ? 'var(--node-input)' : 'var(--node-condition)',
            }}>
              {assistant.status}
            </span>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <button
            onClick={() => setActiveTab('chat')}
            style={{
              flex: 1,
              padding: 'var(--space-3)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'chat' ? `2px solid ${aliasColor}` : '2px solid transparent',
              color: activeTab === 'chat' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'chat' ? 600 : 400,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            💬 Chat
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            style={{
              flex: 1,
              padding: 'var(--space-3)',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'rules' ? `2px solid ${aliasColor}` : '2px solid transparent',
              color: activeTab === 'rules' ? 'var(--text-primary)' : 'var(--text-muted)',
              fontWeight: activeTab === 'rules' ? 600 : 400,
              fontSize: 13,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            📋 Rules ({assistant.routines})
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'chat' ? (
          <>
            {/* Chat Messages */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: 'var(--space-4) var(--space-5)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-3)',
              minHeight: 250,
            }}>
              {messages.length === 0 && (
                <div style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  padding: 'var(--space-6)',
                }}>
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: `${aliasColor}20`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 'var(--space-3)',
                  }}>
                    <span style={{ fontSize: 20 }}>💬</span>
                  </div>
                  <div style={{ fontSize: 14, marginBottom: 'var(--space-2)' }}>
                    Chat with <span style={{ color: aliasColor, fontWeight: 500 }}>{assistant.alias}</span>
                  </div>
                  <div style={{ fontSize: 12 }}>
                    Send a message to start a conversation
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <ChatBubble key={msg.id} message={msg} aliasColor={aliasColor} assistantAlias={assistant.alias} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Chat Input */}
            <div style={{
              padding: 'var(--space-4) var(--space-5)',
              borderTop: '1px solid var(--border)',
              background: 'var(--bg-muted)',
              flexShrink: 0,
            }}>
              <div style={{
                display: 'flex',
                gap: 'var(--space-2)',
                alignItems: 'flex-end',
              }}>
                <textarea
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={`Ask ${assistant.alias} something...`}
                  rows={1}
                  style={{
                    flex: 1,
                    padding: 'var(--space-3) var(--space-4)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    resize: 'none',
                    outline: 'none',
                    minHeight: 42,
                    maxHeight: 120,
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!inputValue.trim() || isStreaming}
                  style={{
                    padding: 'var(--space-3) var(--space-4)',
                    background: inputValue.trim() && !isStreaming ? 'var(--primary)' : 'var(--bg-elevated)',
                    border: '1px solid',
                    borderColor: inputValue.trim() && !isStreaming ? 'var(--primary)' : 'var(--border)',
                    borderRadius: 'var(--radius-md)',
                    color: inputValue.trim() && !isStreaming ? 'white' : 'var(--text-muted)',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: inputValue.trim() && !isStreaming ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s ease',
                    minHeight: 42,
                  }}
                >
                  {isStreaming ? '...' : 'Send'}
                </button>
              </div>
              <div style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                marginTop: 'var(--space-2)',
                textAlign: 'center',
              }}>
                Press Enter to send
              </div>
            </div>
          </>
        ) : (
          /* Rules Tab */
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: 'var(--space-4) var(--space-5)',
            minHeight: 250,
          }}>
            <RuleSetViewer ruleSet={assistant.ruleSet} aliasColor={aliasColor} />

            {/* Capabilities Section */}
            {assistant.capabilityList.length > 0 && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <div style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  marginBottom: 'var(--space-2)',
                }}>
                  Capabilities
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
                  {assistant.capabilityList.map(cap => (
                    <span
                      key={cap}
                      style={{
                        padding: 'var(--space-1) var(--space-2)',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {cap}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatBubble({ message, aliasColor, assistantAlias }: {
  message: ChatMessage;
  aliasColor: string;
  assistantAlias: string;
}) {
  const isUser = message.role === 'user';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        fontSize: 11,
        color: 'var(--text-muted)',
        marginBottom: 'var(--space-1)',
      }}>
        {isUser ? 'You' : assistantAlias}
      </div>

      {/* Rule Decision Display - shown before assistant response */}
      {!isUser && message.ruleDecision && (
        <RuleDecisionDisplay decision={message.ruleDecision} aliasColor={aliasColor} />
      )}

      <div style={{
        maxWidth: '85%',
        padding: 'var(--space-3) var(--space-4)',
        background: isUser ? 'var(--primary)' : 'var(--bg-muted)',
        borderRadius: 'var(--radius-md)',
        borderTopRightRadius: isUser ? 4 : 'var(--radius-md)',
        borderTopLeftRadius: isUser ? 'var(--radius-md)' : 4,
        color: isUser ? 'white' : 'var(--text-primary)',
        fontSize: 14,
        lineHeight: 1.5,
        border: isUser ? 'none' : '1px solid var(--border)',
      }}>
        {message.content || (message.streaming && !message.ruleDecision?.complete && (
          <span style={{ opacity: 0.5 }}>Evaluating rules...</span>
        ))}
        {message.content === '' && message.streaming && message.ruleDecision?.complete && (
          <span style={{ opacity: 0.5 }}>Generating response...</span>
        )}
        {message.streaming && message.content && (
          <span style={{
            display: 'inline-block',
            width: 6,
            height: 14,
            background: aliasColor,
            marginLeft: 2,
            animation: 'blink 1s infinite',
          }} />
        )}
      </div>
      <style>{`
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function RuleDecisionDisplay({ decision, aliasColor }: { decision: RuleDecision; aliasColor: string }) {
  const [expanded, setExpanded] = useState(true);

  if (!decision.ruleSetName) return null;

  return (
    <div style={{
      maxWidth: '100%',
      marginBottom: 'var(--space-2)',
      fontSize: 11,
      fontFamily: 'var(--font-mono)',
    }}>
      {/* Header */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-3)',
          background: 'var(--bg-elevated)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          cursor: 'pointer',
          marginBottom: expanded ? 'var(--space-1)' : 0,
        }}
      >
        <span style={{ color: aliasColor }}>⚡</span>
        <span style={{ color: 'var(--text-secondary)' }}>
          {decision.complete
            ? decision.selectedRule
              ? `Rule matched: ${decision.selectedRule.name}`
              : 'No rules matched'
            : `Evaluating ${decision.ruleSetName}...`}
        </span>
        <span style={{
          marginLeft: 'auto',
          color: 'var(--text-muted)',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
        }}>▼</span>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: 'var(--space-2)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}>
          {/* Rule evaluations */}
          {decision.evaluations.map((eval_, i) => (
            <div key={eval_.ruleId} style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-1)',
              padding: 'var(--space-2)',
              background: eval_.matched ? `${aliasColor}15` : 'transparent',
              borderRadius: 'var(--radius-sm)',
              border: eval_.matched ? `1px solid ${aliasColor}40` : '1px solid transparent',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
              }}>
                <span style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: eval_.matched ? aliasColor : 'var(--bg-muted)',
                  color: eval_.matched ? 'white' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                }}>
                  {eval_.matched ? '✓' : i + 1}
                </span>
                <span style={{
                  fontWeight: eval_.matched ? 600 : 400,
                  color: eval_.matched ? aliasColor : 'var(--text-secondary)',
                }}>
                  {eval_.ruleName}
                </span>
                <span style={{
                  marginLeft: 'auto',
                  fontSize: 10,
                  color: 'var(--text-muted)',
                }}>
                  P{eval_.priority}
                </span>
              </div>

              {/* Condition results */}
              {eval_.conditions.length > 0 && (
                <div style={{
                  paddingLeft: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}>
                  {eval_.conditions.map((cond, j) => (
                    <div key={j} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-1)',
                      fontSize: 10,
                      color: cond.matched ? 'var(--node-input)' : 'var(--node-condition)',
                    }}>
                      <span>{cond.matched ? '✓' : '✗'}</span>
                      <span style={{ color: 'var(--secondary)' }}>{cond.field.split('.').pop()}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{cond.operator}</span>
                      <span style={{ color: 'var(--tertiary)' }}>
                        {typeof cond.value === 'string' ? `"${cond.value}"` : String(cond.value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Actions to be taken */}
          {decision.actions && decision.actions.length > 0 && (
            <div style={{
              borderTop: '1px solid var(--border)',
              paddingTop: 'var(--space-2)',
              marginTop: 'var(--space-1)',
            }}>
              <div style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                marginBottom: 'var(--space-1)',
              }}>
                ACTIONS
              </div>
              {decision.actions.map((action, i) => (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: 'var(--space-1) 0',
                  color: 'var(--text-secondary)',
                }}>
                  <span style={{ color: aliasColor }}>→</span>
                  <span>{action.description}</span>
                </div>
              ))}
            </div>
          )}

          {/* No match state */}
          {decision.complete && !decision.selectedRule && (
            <div style={{
              color: 'var(--text-muted)',
              fontStyle: 'italic',
              padding: 'var(--space-2)',
            }}>
              No rules matched. Using default LLM behavior.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
