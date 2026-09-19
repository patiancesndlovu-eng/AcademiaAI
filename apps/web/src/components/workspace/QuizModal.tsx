import { useRef, useState, useEffect } from "react";
import { Check, ChevronDown, Sparkles, Loader2, FileText, AlertCircle } from "lucide-react";
import { ModalShell } from "./ModalShell";
import { Popover } from "@/components/common/Popover";
import { createGeneration, getGeneration, type GenerationJob } from "@/lib/api";

function Segment({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="mb-2 block text-[13px] font-semibold text-[#d7dae1]">{label}</label>
      <div className="flex overflow-hidden rounded-full border border-[#4c515c] bg-[#24272c]">
        {options.map((option) => (
          <button key={option} onClick={() => onChange(option)} className={`flex-1 whitespace-nowrap px-2.5 py-2.5 text-[12px] transition ${value === option ? "bg-[#3b404b] text-[#f0f2f6]" : "text-[#aeb5c0] hover:bg-[#2d3138]"}`}>
            {value === option && <Check size={12} className="mr-1 inline" />}{option}
          </button>
        ))}
      </div>
    </div>
  );
}

interface QuizModalProps {
  notebookId: string;
  selectedSources: any[];
  onClose: () => void;
  onGenerated: (job: GenerationJob) => void;
}

export function QuizModal({ notebookId, selectedSources, onClose, onGenerated }: QuizModalProps) {
  const [count, setCount] = useState("Standard");
  const [difficulty, setDifficulty] = useState("Medium");
  const [topic, setTopic] = useState("");
  const [generating, setGenerating] = useState(false);
  const [polling, setPolling] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourcesRef = useRef<HTMLButtonElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSources = selectedSources.length > 0;

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  const countMap = { Fewer: 5, Standard: 10, More: 20 };
  const difficultyMap = { Easy: 'easy', Medium: 'medium', Hard: 'hard' };

  const handleGenerate = async () => {
    if (generating || polling || !hasSources) return;
    setGenerating(true);
    setError(null);

    try {
      const res = await createGeneration(notebookId, {
        type: 'quiz',
        config: {
          questionCount: countMap[count as keyof typeof countMap],
          difficulty: difficultyMap[difficulty as keyof typeof difficultyMap],
          topic: topic.trim() || undefined,
        },
      });

      setGenerating(false);
      setPolling(true);
      pollJob(res.jobId);
    } catch (e: any) {
      setGenerating(false);
      setError(e?.message || 'Failed to start quiz generation');
    }
  };

  const pollJob = async (jobId: string) => {
    let attempts = 0;
    const maxAttempts = 60; // ~5 minutes with 5s intervals

    const interval = setInterval(async () => {
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        pollRef.current = null;
        setPolling(false);
        setError('Generation timed out');
        return;
      }
      attempts++;

      try {
        const job = await getGeneration(notebookId, jobId);
        if (job.status === 'completed') {
          clearInterval(interval);
          pollRef.current = null;
          setPolling(false);
          onGenerated(job);
          onClose();
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          clearInterval(interval);
          pollRef.current = null;
          setPolling(false);
          setError(job.error || `Generation ${job.status}`);
        }
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 5000);

    pollRef.current = interval;
  };

  return (
    <ModalShell title="Quiz" onClose={onClose}>
      <div className="grid gap-7 sm:grid-cols-3">
        <Segment label="Number of questions" options={["Fewer", "Standard", "More"]} value={count} onChange={setCount} />
        <Segment label="Level of difficulty" options={["Easy", "Medium", "Hard"]} value={difficulty} onChange={setDifficulty} />
        <div>
          <label className="mb-2 block text-[13px] font-semibold text-[#d7dae1]">Sources</label>
          <div className="relative">
            <button ref={sourcesRef} onClick={() => setSourcesOpen((v) => !v)} aria-expanded={sourcesOpen} className="flex w-full items-center justify-between rounded-full border border-[#4c515c] bg-[#24272c] px-3.5 py-2.5 text-[13px] text-[#e7e9ee] transition hover:border-[#6b8eef]">
              <span className={hasSources ? "" : "text-[#9ba2ae]"}>{hasSources ? `${selectedSources.length} selected` : "None selected"}</span><ChevronDown size={15} />
            </button>
            <Popover open={sourcesOpen} onClose={() => setSourcesOpen(false)} anchorRef={sourcesRef} align="right" className="w-64">
              {hasSources ? (
                <div className="max-h-48 overflow-y-auto">
                  {selectedSources.map((source) => (
                    <div key={source.id} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px] text-[#d6d9df]">
                      <FileText size={13} className="shrink-0 text-[#858c98]" />
                      <span className="truncate">{source.title}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-3 py-2 text-[12px] leading-5 text-[#9ba2ae]">Select sources in the Sources panel on the left — the quiz is generated from them.</p>
              )}
            </Popover>
          </div>
        </div>
      </div>
      <div className="mt-7">
        <label className="mb-2 block text-[13px] font-semibold text-[#d7dae1]">What should the topic be?</label>
        <textarea
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          rows={5}
          placeholder="Add 5 multiple-choice questions testing the core methods and arguments in these sources."
          className="w-full resize-none rounded-xl border border-[#4c515c] bg-[#15171a] px-4 py-3 text-[14px] leading-6 text-[#eef0f4] outline-none transition placeholder:text-[#7f8794] focus:border-[#6b8eef] focus:ring-2 focus:ring-[#5f75b1]/40"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setTopic("Key concepts and definitions")} className="rounded-full border border-[#58606e] px-3 py-2 text-xs text-[#d9dde4] transition hover:bg-[#2b3039]">+ Key concepts</button>
          <button onClick={() => setTopic("Compare the methods used by each author")} className="rounded-full border border-[#58606e] px-3 py-2 text-xs text-[#d9dde4] transition hover:bg-[#2b3039]">+ Compare methods</button>
          <button onClick={() => setTopic("Evidence and limitations")} className="rounded-full border border-[#58606e] px-3 py-2 text-xs text-[#d9dde4] transition hover:bg-[#2b3039]">+ Evidence & limits</button>
        </div>
      </div>
      {error && (
        <div className="mt-4 rounded-xl border border-[#c05a5a] bg-[#2d2426] p-3 text-sm text-[#f0d0d0] flex items-start gap-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="mt-8 flex items-center justify-between gap-3 border-t border-[#30343b] pt-5">
        {!hasSources && <p className="text-[12px] text-[#9ba2ae]">Select at least one source to generate.</p>}
        <div className="ml-auto flex items-center gap-3">
          <button onClick={onClose} disabled={generating || polling} className="rounded-full px-4 py-2.5 text-[13px] font-medium text-[#b4bbc7] transition hover:bg-[#2c3037] hover:text-white disabled:opacity-50">Cancel</button>
          <button onClick={handleGenerate} disabled={generating || polling || !hasSources} className="inline-flex items-center gap-2 rounded-full bg-[#6f8ff0] px-5 py-2.5 text-[13px] font-semibold text-[#141b2d] transition hover:bg-[#92abff] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40">
            {(generating || polling) ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            {generating ? "Starting…" : polling ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}