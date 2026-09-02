import { useState } from "react";
import { PanelLeft, Sparkles, Clipboard, ChevronRight, Headphones, Layers3, Video, Network, FileCheck2, BookOpenCheck, HelpCircle, ImageIcon, Grid2X2, Loader2, X } from "lucide-react";
import { ModalShell } from "./ModalShell";

type StudioKind = "audio" | "slides" | "video" | "map" | "report" | "flashcards" | "quiz" | "infographic" | "table";

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
];

interface StudioRailProps {
  onQuiz: () => void;
  onToast: (message: string) => void;
  onAddNote: () => void;
}

function GenerateModal({ title, onClose, onGenerate }: { title: string; onClose: () => void; onGenerate: () => void }) {
  const [generating, setGenerating] = useState(false);
  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="mx-auto max-w-[480px] text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#303850] text-[#9fbaff]">
          <Sparkles size={26} />
        </div>
        <h3 className="mt-5 font-display text-[22px] tracking-[-0.03em] text-[#f0f2f6]">Generate {title.toLowerCase()}</h3>
        <p className="mx-auto mt-2 max-w-[360px] text-sm leading-6 text-[#9ba2ae]">This will create a {title.toLowerCase()} from your selected sources. You can refine the output once it&apos;s ready.</p>
        <div className="mt-7 flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-full px-4 py-2.5 text-[13px] font-medium text-[#b4bbc7] transition hover:bg-[#2c3037] hover:text-white">Cancel</button>
          <button
            disabled={generating}
            onClick={() => { setGenerating(true); setTimeout(() => { setGenerating(false); onGenerate(); onClose(); }, 1200); }}
            className="inline-flex items-center gap-2 rounded-full bg-[#6f8ff0] px-5 py-2.5 text-[13px] font-semibold text-[#141b2d] transition hover:bg-[#92abff] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {generating ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
            Generate
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

export function StudioRail({ onQuiz, onToast, onAddNote }: StudioRailProps) {
  const [activeModal, setActiveModal] = useState<string | null>(null);

  const handleItemClick = (item: typeof studioItems[0]) => {
    if (item.kind === "quiz") {
      onQuiz();
      return;
    }
    setActiveModal(item.title);
  };

  return (
    <>
      <aside className="flex min-h-0 w-full flex-col border-t border-[#30343b] bg-[#1e2024] xl:w-[318px] xl:border-l xl:border-t-0">
        <div className="flex items-center justify-between border-b border-[#30343b] px-4 py-3.5">
          <h2 className="font-display text-[16px] text-[#e8ebf0]">Studio</h2>
          <button onClick={() => onToast("Studio panel expanded")} className="text-[#aeb4bf] transition hover:text-white"><PanelLeft size={17} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <button onClick={() => onToast("Describe the output you want")} className="mb-4 flex w-full items-start gap-3 rounded-2xl border border-[#355c51] bg-[#274239] p-3 text-left text-[12px] leading-5 text-[#d6eee4] transition hover:border-[#5a907f]">
            <Sparkles size={16} className="mt-0.5 shrink-0 text-[#a9e2c9]" />
            <span>Turn these sources into a clear study guide with key terms, evidence, and questions.</span>
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
          <div className="mt-5 border-t border-[#30343b] pt-6 text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-[#2d3652] text-[#91adff]">
              <Sparkles size={21} />
            </div>
            <p className="mt-4 font-display text-[15px] text-[#a9b0bc]">Your study outputs will be saved here.</p>
            <p className="mt-1 px-6 text-[12px] leading-5 text-[#7e8693]">Generate an audio brief, quiz, or report to start building your study kit.</p>
            <button onClick={onAddNote} className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#eef0f4] px-4 py-2.5 text-[13px] font-medium text-[#282a30] transition hover:bg-white active:scale-[0.98]">
              <Clipboard size={15} /> Add note
            </button>
          </div>
        </div>
      </aside>

      {activeModal && (
        <GenerateModal
          title={activeModal}
          onClose={() => setActiveModal(null)}
          onGenerate={() => onToast(`${activeModal} generated`)}
        />
      )}
    </>
  );
}