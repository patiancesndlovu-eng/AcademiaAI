import { useState } from "react";
import { Check, ChevronDown, Sparkles } from "lucide-react";
import { ModalShell } from "./ModalShell";

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
  onClose: () => void;
  onToast: (message: string) => void;
}

export function QuizModal({ onClose, onToast }: QuizModalProps) {
  const [count, setCount] = useState("Standard");
  const [difficulty, setDifficulty] = useState("Medium");
  const [topic, setTopic] = useState("");

  return (
    <ModalShell title="Quiz" onClose={onClose}>
      <div className="grid gap-7 sm:grid-cols-3">
        <Segment label="Number of questions" options={["Fewer", "Standard", "More"]} value={count} onChange={setCount} />
        <Segment label="Level of difficulty" options={["Easy", "Medium", "Hard"]} value={difficulty} onChange={setDifficulty} />
        <div>
          <label className="mb-2 block text-[13px] font-semibold text-[#d7dae1]">Sources</label>
          <button className="flex w-full items-center justify-between rounded-full border border-[#4c515c] bg-[#24272c] px-3.5 py-2.5 text-[13px] text-[#e7e9ee]">
            <span>8 sources</span><ChevronDown size={15} />
          </button>
        </div>
      </div>
      <div className="mt-7">
        <label className="mb-2 block text-[13px] font-semibold text-[#d7dae1]">What should the topic be?</label>
        <textarea
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          rows={5}
          placeholder="Add 5 multiple-choice questions testing the core methods and arguments in these sources."
          className="w-full resize-none rounded-xl border border-[#4c515c] bg-[#15171a] px-4 py-3 text-[14px] leading-6 text-[#eef0f4] outline-none transition placeholder:text-[#7f8794] focus:border-[#7995e9] focus:ring-1 focus:ring-[#5f75b1]"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => setTopic("Key concepts and definitions") } className="rounded-full border border-[#58606e] px-3 py-2 text-xs text-[#d9dde4] transition hover:bg-[#2b3039]">+ Key concepts</button>
          <button onClick={() => setTopic("Compare the methods used by each author") } className="rounded-full border border-[#58606e] px-3 py-2 text-xs text-[#d9dde4] transition hover:bg-[#2b3039]">+ Compare methods</button>
          <button onClick={() => setTopic("Evidence and limitations") } className="rounded-full border border-[#58606e] px-3 py-2 text-xs text-[#d9dde4] transition hover:bg-[#2b3039]">+ Evidence & limits</button>
        </div>
      </div>
      <div className="mt-8 flex items-center justify-end gap-3 border-t border-[#30343b] pt-5">
        <button onClick={onClose} className="rounded-full px-4 py-2.5 text-[13px] font-medium text-[#b4bbc7] transition hover:bg-[#2c3037] hover:text-white">Cancel</button>
        <button onClick={() => { onClose(); onToast("Quiz generation started"); }} className="inline-flex items-center gap-2 rounded-full bg-[#6f8ff0] px-5 py-2.5 text-[13px] font-semibold text-[#141b2d] transition hover:bg-[#92abff] active:scale-[0.98]">
          <Sparkles size={15} /> Generate
        </button>
      </div>
    </ModalShell>
  );
}