import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowRight, SlidersHorizontal, MoreVertical, BrainCircuit, Sparkles, Trash2, Download, MessageSquarePlus } from "lucide-react";
import { IconButton } from "@/components/common/Primitives";

interface ChatCanvasProps {
  notebook: any;
  sources: any[];
  onToast: (message: string) => void;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function ChatCanvas({ notebook, sources, onToast }: ChatCanvasProps) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const [style, setStyle] = useState<"concise" | "detailed" | "academic">("concise");
  const [styleOpen, setStyleOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sending, setSending] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedSources = sources.filter((s) => s.selected);
  const sourceCount = selectedSources.length;

  /* Auto-resize textarea */
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 112) + "px"; /* 112px ≈ 28px * 4 rows max */
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [prompt, resizeTextarea]);

  const sendPrompt = async () => {
    if (!prompt.trim() || sending) return;
    const nextPrompt = prompt.trim();
    setMessages((current) => [...current, { role: "user", text: nextPrompt }]);
    setPrompt("");
    setSending(true);

    /* Simulate AI response — replace with real API call */
    setTimeout(() => {
      setMessages((current) => [
        ...current,
        { role: "ai", text: `I’ll connect that question to the ${sourceCount} selected sources and keep the reasoning traceable. For now, start by comparing the authors’ definitions, methods, and strongest evidence.` }
      ]);
      setSending(false);
    }, 800);
  };

  const clearChat = () => {
    setMessages([]);
    setOptionsOpen(false);
    onToast("Chat cleared");
  };

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#202226]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[#30343b] px-5 py-3.5">
        <h2 className="font-display text-[16px] text-[#e8ebf0]">Chat</h2>
        <div className="flex items-center gap-1">
          {/* Settings dropdown */}
          <div className="relative">
            <IconButton label="Chat settings" onClick={() => setSettingsOpen((v) => !v)}><SlidersHorizontal size={17} /></IconButton>
            {settingsOpen && (
              <div className="absolute right-0 top-10 z-30 w-52 overflow-hidden rounded-2xl border border-[#3a3f49] bg-[#292c32] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,.4)] animate-pop-in">
                <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#858c98]">Response style</div>
                {(["concise", "detailed", "academic"] as const).map((s) => (
                  <button key={s} onClick={() => { setStyle(s); setSettingsOpen(false); onToast(`Style set to ${s}`); }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition hover:bg-[#373b44] ${style === s ? "text-[#9ebaff]" : "text-[#d6d9df]"}`}>
                    {s === "concise" ? <MessageSquarePlus size={14} /> : s === "detailed" ? <BrainCircuit size={14} /> : <Sparkles size={14} />}
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Options dropdown */}
          <div className="relative">
            <IconButton label="Chat options" onClick={() => setOptionsOpen((v) => !v)}><MoreVertical size={18} /></IconButton>
            {optionsOpen && (
              <div className="absolute right-0 top-10 z-30 w-44 overflow-hidden rounded-2xl border border-[#3a3f49] bg-[#292c32] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,.4)] animate-pop-in">
                <button onClick={clearChat} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-[#d6d9df] transition hover:bg-[#373b44]"><Trash2 size={14} /> Clear chat</button>
                <button onClick={() => { setOptionsOpen(false); onToast("Chat exported"); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] text-[#d6d9df] transition hover:bg-[#373b44]"><Download size={14} /> Export chat</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-[720px] pt-9">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#323a50] text-[#abc2ff]">
              <BrainCircuit size={22} />
            </div>
            {/* Style selector */}
            <div className="relative">
              <button onClick={() => setStyleOpen((v) => !v)} className="flex items-center gap-2 rounded-full border border-[#3c414b] px-3.5 py-2 text-xs font-medium text-[#d4d8e1] transition hover:border-[#65708b]">
                <Sparkles size={14} className="text-[#9cb9ff]" /> {style.charAt(0).toUpperCase() + style.slice(1)}
              </button>
              {styleOpen && (
                <div className="absolute right-0 top-10 z-30 w-40 overflow-hidden rounded-2xl border border-[#3a3f49] bg-[#292c32] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,.4)] animate-pop-in">
                  {(["concise", "detailed", "academic"] as const).map((s) => (
                    <button key={s} onClick={() => { setStyle(s); setStyleOpen(false); onToast(`Style set to ${s}`); }} className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition hover:bg-[#373b44] ${style === s ? "text-[#9ebaff]" : "text-[#d6d9df]"}`}>
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <h1 className="mt-8 max-w-[710px] font-display text-[26px] leading-[1.12] tracking-[-0.048em] text-[#f0f2f6] sm:text-[34px]">{notebook.title}</h1>
          <p className="mt-3 text-[13px] text-[#a2a9b5]">{sourceCount} sources selected · Updated {formatDate(notebook.updatedAt)}</p>
          <div className="mt-12 space-y-6 text-[15px] leading-[1.7] text-[#c8ccd4]">
            <p>These sources offer a practical framework for <strong className="font-semibold text-[#eef0f4]">reading, evaluating, and connecting academic work</strong> without losing sight of the original evidence. Begin with the author&apos;s question, trace the method that supports it, and keep a note of what the source does not claim.</p>
            <p>For a stronger literature review, group papers by <strong className="font-semibold text-[#eef0f4]">argument and method</strong> rather than by publication date alone. That makes patterns visible: where findings converge, where definitions diverge, and which assumptions deserve a sharper question.</p>
          </div>
          {messages.length > 0 && (
            <div className="mt-8 space-y-4">
              {messages.map((message, index) => (
                <div key={`${message.role}-${index}`} className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-[14px] leading-6 ${message.role === "user" ? "bg-[#34446c] text-[#edf2ff]" : "border border-[#3b404a] bg-[#282b31] text-[#ccd1da]"}`}>
                    {message.text}
                  </div>
                </div>
              ))}
              {sending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl border border-[#3b404a] bg-[#282b31] px-4 py-3 text-[14px] text-[#ccd1da]">
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#7ea7ff]" style={{ animationDelay: "0ms" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#7ea7ff]" style={{ animationDelay: "150ms" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full bg-[#7ea7ff]" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Input */}
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