import { useState } from "react";
import { Plus, BookMarked } from "lucide-react";
import { ModalShell } from "@/components/workspace/ModalShell";

interface CreateNotebookModalProps {
  onClose: () => void;
  onCreate: (title: string) => void;
}

export function CreateNotebookModal({ onClose, onCreate }: CreateNotebookModalProps) {
  const [title, setTitle] = useState("");

  return (
    <ModalShell title="Create notebook" onClose={onClose} size="wide">
      <div className="mx-auto max-w-[560px]">
        <div className="flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#303850] text-[#9fbaff]">
            <BookMarked size={30} />
          </span>
        </div>
        <h3 className="mt-6 text-center font-display text-[26px] tracking-[-0.04em] text-[#f0f2f6]">What are you trying to understand?</h3>
        <p className="mx-auto mt-2 max-w-[420px] text-center text-sm leading-6 text-[#9ba2ae]">Give your notebook a working title. You can add sources and refine the question once you&apos;re inside.</p>
        <label className="mt-8 block text-[13px] font-semibold text-[#d7dae1]">Notebook title</label>
        <input
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter" && title.trim()) onCreate(title.trim()); }}
          placeholder="e.g. Designing a stronger literature review"
          className="mt-2 w-full rounded-xl border border-[#4b515c] bg-[#15171a] px-4 py-3 text-sm text-[#eef0f4] outline-none transition placeholder:text-[#7e8794] focus:border-[#7d97e9] focus:ring-1 focus:ring-[#6077b5]"
        />
        <div className="mt-7 flex items-center justify-end gap-3">
          <button onClick={onClose} className="rounded-full px-4 py-2.5 text-[13px] font-medium text-[#b4bbc7] transition hover:bg-[#2c3037] hover:text-white">Cancel</button>
          <button
            disabled={!title.trim()}
            onClick={() => onCreate(title.trim())}
            className="inline-flex items-center gap-2 rounded-full bg-[#6f8ff0] px-5 py-2.5 text-[13px] font-semibold text-[#141b2d] transition hover:bg-[#92abff] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={15} /> Create notebook
          </button>
        </div>
      </div>
    </ModalShell>
  );
}