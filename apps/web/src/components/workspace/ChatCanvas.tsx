import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowRight, SlidersHorizontal, MoreVertical, BrainCircuit, Sparkles, Trash2, Download, MessageSquarePlus, Globe2, Loader2 } from "lucide-react";
import { IconButton } from "@/components/common/Primitives";
import { Popover, PopoverItem } from "@/components/common/Popover";
import { streamChat, type ChatMessage as APIChatMessage, getChatMessages } from "@/lib/api";

interface ChatCanvasProps {
  notebook: any;
  sources: any[];
  promptSeed?: { text: string; id: number } | null;
}

interface ChatMessage extends APIChatMessage {
  streaming?: boolean;
  error?: { code: string; message: string; retryable: boolean };
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function createUserMessage(content: string): ChatMessage {
  return { id: `temp-${Date.now()}`, role: 'user', content, streaming: false, createdAt: new Date().toISOString() };
}

function createAssistantMessage(content: string, streaming = true): ChatMessage {
  return { id: `temp-${Date.now()}`, role: 'assistant', content, streaming, createdAt: new Date().toISOString() };
}

function createErrorMessage(error: { code: string; message: string; retryable: boolean }): ChatMessage {
  return { id: `temp-${Date.now()}`, role: 'assistant', content: '', streaming: false, error, createdAt: new Date().toISOString() };
}

export function ChatCanvas({ notebook, sources, promptSeed }: ChatCanvasProps) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [style, setStyle] = useState<"concise" | "detailed" | "academic">("concise");
  const [styleOpen, setStyleOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [webEnhanced, setWebEnhanced] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasMoreHistory, setHasMoreHistory] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const styleRef = useRef<HTMLButtonElement>(null);
  const optionsRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const selectedSources = sources.filter((s) => s.selected);
  const sourceCount = selectedSources.length;

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 112) + "px";
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [prompt, resizeTextarea]);

  useEffect(() => {
    if (!promptSeed) return;
    setPrompt(promptSeed.text);
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    resizeTextarea();
  }, [promptSeed?.id]);

  useEffect(() => {
    loadHistory();
  }, [notebook.id]);

  async function loadHistory(cursor?: string) {
    if (loadingHistory || (!cursor && !hasMoreHistory)) return;
    setLoadingHistory(true);
    try {
      const result = await getChatMessages(notebook.id, { limit: 50, cursor });
      setMessages((prev) => cursor ? [...result.data, ...prev] : result.data);
      setNextCursor(result.meta.nextCursor);
      setHasMoreHistory(result.meta.hasMore);
    } catch (e: any) {
      console.error('Failed to load chat history:', e);
    } finally {
      setLoadingHistory(false);
    }
  }

  async function loadMoreHistory() {
    if (nextCursor) await loadHistory(nextCursor);
  }

  const handleSSEEvent = useCallback((event: { event: string; data: any }) => {
    switch (event.event) {
      case 'message.started':
        break;
      case 'message.delta':
        if (event.data.text) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant' && last.streaming) {
              return [...prev.slice(0, -1), { ...last, content: last.content + event.data.text }];
            }
            return [...prev, createAssistantMessage(event.data.text)];
          });
        }
        break;
      case 'citation':
        break;
      case 'message.completed':
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            return [...prev.slice(0, -1), { ...last, streaming: false, citations: event.data.citations, modelMeta: event.data.modelMeta }];
          }
          return [...prev, { ...createAssistantMessage('', false), citations: event.data.citations, modelMeta: event.data.modelMeta }];
        });
        setSending(false);
        break;
      case 'message.error':
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === 'assistant' && last.streaming) {
            return [...prev.slice(0, -1), createErrorMessage(event.data)];
          }
          return [...prev, createErrorMessage(event.data)];
        });
        setSending(false);
        break;
      case 'message.searching':
        break;
    }
  }, []);

  const sendPrompt = async () => {
    if (!prompt.trim() || sending) return;
    const nextPrompt = prompt.trim();
    setMessages((current) => [...current, createUserMessage(nextPrompt)]);
    setPrompt("");
    setSending(true);

    try {
      await streamChat(notebook.id, {
        content: nextPrompt,
        sourceIds: selectedSources.map(s => s.id),
        webEnhanced,
      }, handleSSEEvent);
    } catch (e: any) {
      setMessages((prev) => [...prev, createErrorMessage({ code: 'AI_GENERATION_FAILED', message: e.message || 'Failed to generate response', retryable: true })]);
      setSending(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setOptionsOpen(false);
  };

  const exportChat = () => {
    setOptionsOpen(false);
    const transcript = messages.map((m) => `${m.role === "user" ? "## You" : "## AcademiaAi"}\n\n${m.content}`).join("\n\n");
    const content = `# ${notebook.title} — chat\n\n${formatDate(notebook.updatedAt)}\n\n${transcript}\n`;
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `chat-${notebook.id}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const styleIcon = (s: string) => (s === "concise" ? <MessageSquarePlus size={14} /> : s === "detailed" ? <BrainCircuit size={14} /> : <Sparkles size={14} />);

  const renderMessage = (message: ChatMessage) => {
    if (message.error) {
      return (
        <div key={message.id} className="flex justify-start">
          <div className="flex items-center gap-2 rounded-2xl border border-[#c05a5a] bg-[#2d2426] px-4 py-3 text-[14px] text-[#f0d0d0]">
            <span>⚠</span>
            <span>{message.error.message}</span>
            {message.error.retryable && (
              <button onClick={sendPrompt} className="ml-2 text-xs underline hover:text-white">Retry</button>
            )}
          </div>
        </div>
      );
    }
    if (message.streaming) {
      return (
        <div key={message.id} className="flex justify-start">
          <div className="flex items-center gap-2 rounded-2xl border border-[#3b404a] bg-[#282b31] px-4 py-3 text-[14px] text-[#ccd1da]">
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#7ea7ff]" style={{ animationDelay: "0ms" }} />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#7ea7ff]" style={{ animationDelay: "150ms" }} />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#7ea7ff]" style={{ animationDelay: "300ms" }} />
          </div>
        </div>
      );
    }
    return (
      <div className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
        <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-[14px] leading-6 ${message.role === "user" ? "bg-[#34446c] text-[#edf2ff]" : "border border-[#3b404a] bg-[#282b31] text-[#ccd1da]"}`}>
          {message.content}
          {message.citations && message.citations.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {message.citations.map((c, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[#3b404a] text-[#9ebaff] cursor-help" title={c.quote || `Source: ${c.sourceId}`}>
                  [{i + 1}]
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#202226]">
      <div className="flex items-center justify-between border-b border-[#30343b] px-5 py-3.5">
        <h2 className="font-display text-[16px] text-[#e8ebf0]">Chat</h2>
        <div className="flex items-center gap-1">
          <div className="relative">
            <IconButton ref={settingsRef} label="Chat settings" active={settingsOpen} onClick={() => setSettingsOpen((v) => !v)}><SlidersHorizontal size={17} /></IconButton>
            <Popover open={settingsOpen} onClose={() => setSettingsOpen(false)} anchorRef={settingsRef} align="right" className="w-52">
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#858c98]">Response style</div>
              {(["concise", "detailed", "academic"] as const).map((s) => (
                <PopoverItem key={s} icon={styleIcon(s)} active={style === s} onClick={() => { setStyle(s); setSettingsOpen(false); }}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </PopoverItem>
              ))}
              <div className="border-t border-[#30343b] my-2" />
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#858c98]">Web search</div>
              <PopoverItem active={webEnhanced} onClick={() => { setWebEnhanced(!webEnhanced); setSettingsOpen(false); }}>
                <span className="flex items-center gap-2">{webEnhanced && <Globe2 size={14} className="text-[#7ea7ff]" />} Web-enhanced answers</span>
              </PopoverItem>
            </Popover>
          </div>
          <div className="relative">
            <IconButton ref={optionsRef} label="Chat options" active={optionsOpen} onClick={() => setOptionsOpen((v) => !v)}><MoreVertical size={18} /></IconButton>
            <Popover open={optionsOpen} onClose={() => setOptionsOpen(false)} anchorRef={optionsRef} align="right" className="w-44">
              <PopoverItem icon={<Trash2 size={14} />} disabled={messages.length === 0} onClick={clearChat}>Clear chat</PopoverItem>
              <PopoverItem icon={<Download size={14} />} disabled={messages.length === 0} onClick={exportChat}>Export chat</PopoverItem>
            </Popover>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[720px] pt-9">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#323a50] text-[#abc2ff]">
              <BrainCircuit size={22} />
            </div>
            <div className="relative">
              <button ref={styleRef} onClick={() => setStyleOpen((v) => !v)} aria-expanded={styleOpen} className="flex items-center gap-2 rounded-full border border-[#3c414b] px-3.5 py-2 text-xs font-medium text-[#d4d8e1] transition hover:border-[#65708b]">
                <Sparkles size={14} className="text-[#9cb9ff]" /> {style.charAt(0).toUpperCase() + style.slice(1)}
              </button>
              <Popover open={styleOpen} onClose={() => setStyleOpen(false)} anchorRef={styleRef} align="right" className="w-40">
                {(["concise", "detailed", "academic"] as const).map((s) => (
                  <PopoverItem key={s} active={style === s} onClick={() => { setStyle(s); setStyleOpen(false); }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </PopoverItem>
                ))}
              </Popover>
            </div>
          </div>
          <h1 className="mt-8 max-w-[710px] font-display text-[26px] leading-[1.12] tracking-[-0.048em] text-[#f0f2f6] sm:text-[34px]">{notebook.title}</h1>
          <p className="mt-3 text-[13px] text-[#a2a9b5]">{sourceCount} sources selected · Updated {formatDate(notebook.updatedAt)}</p>
          <div className="mt-12 space-y-6 text-[15px] leading-[1.7] text-[#c8ccd4]">
            <p>These sources offer a practical framework for <strong className="font-semibold text-[#eef0f4]">reading, evaluating, and connecting academic work</strong> without losing sight of the original evidence. Begin with the author&apos;s question, trace the method that supports it, and keep a note of what the source does not claim.</p>
            <p>For a stronger literature review, group papers by <strong className="font-semibold text-[#eef0f4]">argument and method</strong> rather than by publication date alone. That makes patterns visible: where findings converge, where definitions diverge, and which assumptions deserve a sharper question.</p>
          </div>
          {(messages.length > 0 || loadingHistory) && (
            <div className="mt-8 space-y-4">
              {loadingHistory && !messages.length && (
                <div className="flex justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-[#7ea7ff]" />
                </div>
              )}
              {messages.map((message, index) => (
                <div key={`${message.id}-${index}`}>{renderMessage(message)}</div>
              ))}
              {hasMoreHistory && messages.length > 0 && (
                <button onClick={loadMoreHistory} disabled={loadingHistory} className="mx-auto flex items-center justify-center gap-2 rounded-full border border-[#3c414b] bg-[#24272c] px-4 py-2 text-[13px] text-[#d4d8e1] transition hover:border-[#65708b] hover:bg-[#2c3038] disabled:opacity-50">
                  {loadingHistory ? <Loader2 size={14} className="animate-spin" /> : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[#30343b] px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-[720px] items-end gap-3 rounded-[17px] border border-[#4a4f59] bg-[#24272c] p-3 shadow-[0_10px_30px_rgba(0,0,0,.12)] transition focus-within:border-[#748bc5] focus-within:ring-1 focus-within:ring-[#5f75b1]/40">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendPrompt(); } }}
            rows={1}
            placeholder="Ask a question or create something"
            className="max-h-28 min-h-[34px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] leading-6 text-[#eef0f4] outline-none placeholder:text-[#858d99]"
          />
          <span className="hidden pb-1 text-[11px] text-[#8e96a2] sm:block">{sourceCount} sources</span>
          <button onClick={sendPrompt} aria-label="Send message" disabled={!prompt.trim() || sending} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#6f8fef] text-[#141a2b] transition hover:bg-[#91aaff] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">
            <ArrowRight size={18} />
          </button>
        </div>
        <p className="mx-auto mt-2 max-w-[720px] text-center text-[10px] text-[#707783]">AcademiaAi can make mistakes. Check important details against the original sources.</p>
      </div>
    </section>
  );
}