import { useState, useEffect, useRef } from "react";
import { PanelRight, Sparkles, Clipboard, ChevronRight, Headphones, Layers3, Video, Network, FileCheck2, BookOpenCheck, HelpCircle, ImageIcon, Grid2X2, Loader2, X, Check, AlertCircle } from "lucide-react";
import { ModalShell } from "./ModalShell";
import { QuizModal } from "./QuizModal";
import { createGeneration, getGeneration } from "@/lib/api";

type StudioKind = "audio" | "slides" | "video" | "map" | "report" | "flashcards" | "quiz" | "infographic" | "table" | "summary" | "mindmap";

export interface StudioOutput {
  id: string;
  kind: StudioKind | "note" | "draft";
  title: string;
  detail?: string;
  createdAt: number;
}

const studioItems: { kind: StudioKind; title: string; description: string; tint: string; icon: React.ReactNode; beta?: boolean }[] = [
  { kind: "audio", title: "Audio brief", description: "Listen to the key ideas", tint: "bg-[#31443f]", icon: <Headphones size={16} /> },
  { kind: "slides", title: "Slide deck", description: "Build a concise visual", tint: "bg-[#434333]", icon: <Layers3 size={16} />, beta: true },
  { kind: "video", title: "Video brief", description: "Explain it with motion", tint: "bg-[#30423d]", icon: <Video size={16} /> },
  { kind: "map", title: "Concept map", description: "See the relationships", tint: "bg-[#493942]", icon: <Network size={16} /> },
  { kind: "report", title: "Report", description: "Synthesize the evidence", tint: "bg-[#444432]", icon: <FileCheck2 size={16} /> },
  { kind: "flashcards", title: "Flashcards", description: "Review what matters", tint: "bg-[#453938]", icon: <BookOpenCheck size={16} /> },
  { kind: "quiz", title: "Quiz", description: "Test your understanding", tint: "bg-[#35404a]", icon: <HelpCircle size={16} /> },
  { kind: "infographic", title: "Infographic", description: "Make the pattern visible", tint: "bg-[#463a3f]", icon: <ImageIcon size={16} />, beta: true },
  { kind: "table", title: "Data table", description: "Organize key details", tint: "bg-[#343c48]", icon: <Grid2X2 size={16} /> },
  { kind: "summary", title: "Summary", description: "Concise overview", tint: "bg-[#444432]", icon: <FileCheck2 size={16} /> },
  { kind: "mindmap", title: "Mind map", description: "Visual connections", tint: "bg-[#343c48]", icon: <Network size={16} /> },
];

const STUDY_GUIDE_PROMPT = "Turn these sources into a clear study guide with key terms, evidence, and questions.";

function outputIcon(kind: StudioOutput["kind"]) {
  if (kind === "note") return <Clipboard size={14} />;
  const item = studioItems.find((i) => i.kind === kind);
  return item?.icon ?? <Sparkles size={14} />;
}

function relativeTime(timestamp: number) {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

interface StudioRailProps {
  onToggle: () => void;
  onUsePrompt: (text: string) => void;
  onAddNote: (text: string) => void;
  outputs: StudioOutput[];
  onRemoveOutput: (id: string) => void;
  selectedSourceCount: number;
  notebookId: string;
  sources: any[];
}

function NoteModal({ onClose, onSave }: { onClose: () => void; onSave: (text: string) => void }) {
  const [text, setText] = useState("");
  return (
    <ModalShell title="Add note" onClose={onClose}>
      <div className="mx-auto max-w-[520px]">
        <h3 className="font-display text-[22px] tracking-[-0.03em] text-[#f0f2f6]">Capture a thought</h3>
        <p className="mt-2 text-sm leading-6 text-[#9ba2ae]">Notes are saved to this notebook&apos;s Studio panel.</p>
        <textarea
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={6}
          placeholder="e.g. The authors disagree on the definition of evidence — compare their methods in the report."
          className="mt-5 w-full resize-none rounded-xl border border-[#4b515c] bg-[#15171a] px-4 py-3 text-sm leading-6 text-[#eef0f4] outline-none transition placeholder:text-[#7e8794] focus:border-[#6b8eef] focus:ring-2 focus:ring-[#5f75b1]/40"
        />
        <div className="mt-6 flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-full px-4 py-2.5 text-[13px] font-medium text-[#b4bbc7] transition hover:bg-[#2c3037] hover:text-white">Cancel</button>
          <button
            disabled={!text.trim()}
            onClick={() => { onSave(text.trim()); onClose(); }}
            className="inline-flex items-center gap-2 rounded-full bg-[#6f8ff0] px-5 py-2.5 text-[13px] font-semibold text-[#141b2d] transition hover:bg-[#92abff] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Clipboard size={15} /> Save note
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function GenerationConfigModal({ 
  kind, 
  title, 
  sourceCount, 
  onClose, 
  onGenerate,
  notebookId,
}: { 
  kind: StudioKind; 
  title: string; 
  sourceCount: number; 
  onClose: () => void; 
  onGenerate: (config: any) => void;
  notebookId: string;
}) {
  const [generating, setGenerating] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<any>({});
  const hasSources = sourceCount > 0;
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const configFields: { key: string; label: string; options?: string[]; default: string }[] = 
    kind === 'quiz' ? [
      { key: 'questionCount', label: 'Number of questions', options: ['5', '10', '20', '50'], default: '10' },
      { key: 'difficulty', label: 'Difficulty', options: ['easy', 'medium', 'hard'], default: 'medium' },
      { key: 'topic', label: 'Topic (optional)', default: '' },
    ] :
    kind === 'flashcards' ? [
      { key: 'count', label: 'Number of cards', options: ['10', '20', '50', '100'], default: '20' },
      { key: 'topic', label: 'Topic (optional)', default: '' },
    ] :
    kind === 'summary' ? [
      { key: 'length', label: 'Length', options: ['short', 'medium', 'long'], default: 'medium' },
      { key: 'topic', label: 'Focus (optional)', default: '' },
    ] :
    kind === 'report' ? [
      { key: 'length', label: 'Length', options: ['short', 'medium', 'long'], default: 'medium' },
      { key: 'focus', label: 'Focus area (optional)', default: '' },
    ] :
    kind === 'mindmap' ? [
      { key: 'maxNodes', label: 'Max nodes', options: ['20', '50', '100', '200'], default: '50' },
      { key: 'depth', label: 'Depth', options: ['1', '2', '3', '4', '5'], default: '3' },
      { key: 'topic', label: 'Focus (optional)', default: '' },
    ] : [
      { key: 'topic', label: 'Topic (optional)', default: '' },
    ];

  useEffect(() => {
    setConfig({});
    configFields.forEach(f => { config[f.key] = f.default; });
  }, [kind]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  const handleGenerate = async () => {
    if (generating || polling || !hasSources) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await createGeneration(notebookId, {
        type: kind,
        config: Object.fromEntries(
          Object.entries(config).filter(([, v]) => v !== '')
        ),
      });

      setGenerating(false);
      setPolling(true);
      pollJob(res.jobId);
    } catch (e: any) {
      setGenerating(false);
      setError(e?.message || `Failed to start ${title.toLowerCase()} generation`);
    }
  };

  const pollJob = (jobId: string) => {
    let attempts = 0;
    const maxAttempts = 60;

    const interval = setInterval(async () => {
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setPolling(false);
        setError('Generation timed out');
        return;
      }
      attempts++;

      try {
        const job = await getGeneration(notebookId, jobId);
        if (job.status === 'completed') {
          clearInterval(interval);
          setPolling(false);
          onGenerate({});
          onClose();
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          clearInterval(interval);
          setPolling(false);
          setError(job.error || `Generation ${job.status}`);
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 5000);

    pollIntervalRef.current = interval;
  };

  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="mx-auto max-w-[480px] text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#303850] text-[#9fbaff]">
          <Sparkles size={26} />
        </div>
        <h3 className="mt-5 font-display text-[22px] tracking-[-0.03em] text-[#f0f2f6]">Generate {title.toLowerCase()}</h3>
        <p className="mx-auto mt-2 max-w-[360px] text-sm leading-6 text-[#9ba2ae]">
          {hasSources
            ? <>This will create a {title.toLowerCase()} from your {sourceCount} selected {sourceCount === 1 ? "source" : "sources"}. You can refine the output once it&apos;s ready.</>
            : "Select at least one source in the Sources panel first, then generate from those."}
        </p>

        {configFields.map((field) => (
          <div key={field.key} className="mt-4 text-left">
            <label className="mb-2 block text-[13px] font-semibold text-[#d7dae1]">{field.label}</label>
            {field.options ? (
              <div className="flex overflow-hidden rounded-full border border-[#4c515c] bg-[#24272c]">
                {field.options.map((option) => (
                  <button
                    key={option}
                    onClick={() => setConfig((prev: any) => ({ ...prev, [field.key]: option }))}
                    className={`flex-1 whitespace-nowrap px-2.5 py-2.5 text-[12px] transition ${config[field.key] === option ? "bg-[#3b404b] text-[#f0f2f6]" : "text-[#aeb5c0] hover:bg-[#2d3138]"}`}
                  >
                    {config[field.key] === option && <Check size={12} className="mr-1 inline" />}{option}
                  </button>
                ))}
              </div>
            ) : (
              <input
                value={config[field.key] || ''}
                onChange={(e) => setConfig((prev: any) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.label}
                className="w-full rounded-xl border border-[#4b515c] bg-[#15171a] px-4 py-3 text-sm text-[#eef0f4] outline-none transition placeholder:text-[#7e8794] focus:border-[#6b8eef] focus:ring-2 focus:ring-[#5f75b1]/40"
              />
            )}
          </div>
        ))}

        {error && (
          <div className="mt-4 rounded-xl border border-[#c05a5a] bg-[#2d2426] p-3 text-sm text-[#f0d0d0] flex items-center gap-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="mt-7 flex items-center justify-end gap-3">
          <button onClick={onClose} disabled={generating || polling} className="rounded-full px-4 py-2.5 text-[13px] font-medium text-[#b4bbc7] transition hover:bg-[#2c3037] hover:text-white disabled:opacity-50">Cancel</button>
          <button
            disabled={generating || polling || !hasSources}
            onClick={handleGenerate}
            className="inline-flex items-center gap-2 rounded-full bg-[#6f8ff0] px-5 py-2.5 text-[13px] font-semibold text-[#141b2d] transition hover:bg-[#92abff] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? <Loader2 size={15} className="animate-spin" /> : polling ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {generating ? "Starting…" : polling ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function StudioRail({ onToggle, onUsePrompt, onAddNote, outputs, onRemoveOutput, selectedSourceCount, notebookId, sources }: StudioRailProps) {
  const [activeModal, setActiveModal] = useState<StudioKind | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);

  const handleItemClick = (item: typeof studioItems[0]) => {
    if (item.kind === "quiz") {
      setQuizOpen(true);
      return;
    }
    setActiveModal(item.kind);
  };

  return (
    <>
      <aside className="flex min-h-0 w-full flex-col border-t border-[#30343b] bg-[#1e2024] xl:w-[318px] xl:border-l xl:border-t-0">
        <div className="flex items-center justify-between border-b border-[#30343b] px-4 py-3.5">
          <h2 className="font-display text-[16px] text-[#e8ebf0]">Studio</h2>
          <button onClick={onToggle} aria-expanded="true" aria-label="Hide Studio panel" title="Hide Studio panel" className="text-[#aeb4bf] transition hover:text-white"><PanelRight size={17} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <button onClick={() => onUsePrompt(STUDY_GUIDE_PROMPT)} title="Use this prompt in chat" className="mb-4 flex w-full items-start gap-3 rounded-2xl border border-[#355c51] bg-[#274239] p-3 text-left text-[12px] leading-5 text-[#d6eee4] transition hover:border-[#5a907f]">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-[#a9e2c9]" />
            <span>
              {STUDY_GUIDE_PROMPT}
              <span className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a9e2c9]">Use in chat <ChevronRight size={11} /></span>
            </span>
          </button>
          <div className="grid grid-cols-2 gap-2">
            {studioItems.map((item) => (
              <button key={item.kind} onClick={() => handleItemClick(item)} className={`group min-h-[74px] rounded-xl border border-white/[0.04] ${item.tint} p-3 text-left transition hover:-translate-y-0.5 hover:border-white/20 hover:brightness-110 active:scale-[0.98]`}>
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[#d8deea]">{item.icon}</span>
                  {item.beta && <span className="rounded bg-[#1d2024]/75 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[#eef1f5]">Beta</span>}
                  <ChevronRight size={14} className="ml-auto text-[#a9afb9] transition group-hover:translate-x-0.5" />
                </div>
                <p className="mt-2 text-[12px] font-medium text-[#e4e7ec]">{item.title}</p>
              </button>
            ))}
          </div>
          <div className="mt-5 border-t border-[#30343b] pt-6">
            {outputs.length === 0 ? (
              <div className="text-center">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2d3652] text-[#91adff]">
                  <Sparkles size={21} />
                </div>
                <p className="mt-4 font-display text-[15px] text-[#a9b0bc]">Your study outputs will be saved here.</p>
                <p className="mt-1 px-6 text-[12px] leading-5 text-[#7e8693]">Generate a quiz, flashcards, or report to start building your study kit.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#858c98]">Saved in this notebook</p>
                {outputs.map((output) => (
                  <div key={output.id} className="flex items-start gap-2.5 rounded-xl border border-white/[0.05] bg-[#26292f] p-3">
                    <span className="mt-0.5 shrink-0 text-[#9ebaff]">{outputIcon(output.kind)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12px] font-medium text-[#e4e7ec]">{output.title}</p>
                      {output.detail && <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-[#8f96a3]">{output.detail}</p>}
                      <p className="mt-1 text-[10px] text-[#707783]">{output.kind === "note" ? "Note" : "Draft"} · {relativeTime(output.createdAt)}</p>
                    </div>
                    <button onClick={() => onRemoveOutput(output.id)} aria-label={`Remove ${output.title}`} title={`Remove ${output.title}`} className="rounded-full p-1 text-[#7e8693] transition hover:bg-[#2c3037] hover:text-white">
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-5 text-center">
              <button onClick={() => setNoteOpen(true)} className="inline-flex items-center gap-2 rounded-full bg-[#eef0f4] px-4 py-2.5 text-[13px] font-medium text-[#282a30] transition hover:bg-white active:scale-[0.98]">
                <Clipboard size={15} /> Add note
              </button>
            </div>
          </div>
        </div>
      </aside>

      {activeModal && (
        <GenerationConfigModal
          kind={activeModal}
          title={studioItems.find(i => i.kind === activeModal)?.title || activeModal}
          sourceCount={selectedSourceCount}
          onClose={() => setActiveModal(null)}
          onGenerate={() => {}}
          notebookId={notebookId}
        />
      )}
      {quizOpen && (
        <QuizModal
          selectedSources={sources.filter((s) => s.selected)}
          onClose={() => setQuizOpen(false)}
          onGenerated={() => {
            setQuizOpen(false);
          }}
        />
      )}
      {noteOpen && (
        <NoteModal
          onClose={() => setNoteOpen(false)}
          onSave={onAddNote}
        />
      )}
    </>
  );
}