import { useMemo, useState } from "react";
import { Plus, Search, Sparkles, Globe2, ChevronDown, PanelRight, SlidersHorizontal, MoreVertical, Check } from "lucide-react";
import { SourceGlyph } from "@/components/common/Primitives";

export const sources = [
  { title: "The craft of literature reviews", domain: "journals.sagepub.com", kind: "article", color: "#cf7f7f" },
  { title: "How to read a scientific paper", domain: "nature.com", kind: "paper", color: "#8aa5d8" },
  { title: "Research design: qualitative & quantitative", domain: "press.princeton.edu", kind: "book", color: "#a7c392" },
  { title: "Cognitive load theory in practice", domain: "frontiersin.org", kind: "article", color: "#c6a46c" },
  { title: "Open science and reproducibility", domain: "royalsocietypublishing.org", kind: "paper", color: "#9c90c7" },
  { title: "A field guide to academic argument", domain: "writingcenter.edu", kind: "guide", color: "#7eb4ad" },
  { title: "The visual display of quantitative data", domain: "jstor.org", kind: "book", color: "#cc9978" },
  { title: "Ethics of evidence and interpretation", domain: "plato.stanford.edu", kind: "article", color: "#a8a8b5" },
];

interface SourcesRailProps {
  onAdd: () => void;
  onToast: (message: string) => void;
}

export function SourcesRail({ onAdd, onToast }: SourcesRailProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(() => new Set(sources.map((_, index) => index)));
  const filtered = useMemo(() => sources.filter((source) => source.title.toLowerCase().includes(query.toLowerCase()) || source.domain.toLowerCase().includes(query.toLowerCase())), [query]);
  const allSelected = filtered.length > 0 && filtered.every((source) => selected.has(sources.indexOf(source)));
  const toggleAll = () => setSelected((previous) => { const next = new Set(previous); if (allSelected) filtered.forEach((source) => next.delete(sources.indexOf(source))); else filtered.forEach((source) => next.add(sources.indexOf(source))); return next; });

  return (
    <aside className="flex min-h-0 w-full flex-col border-b border-[#30343b] bg-[#1e2024] xl:w-[300px] xl:border-b-0 xl:border-r">
      <div className="flex items-center justify-between border-b border-[#30343b] px-4 py-4">
        <h2 className="font-display text-[16px] text-[#e8ebf0]">Sources</h2>
        <button onClick={() => onToast("Sources panel expanded")} className="text-[#aeb4bf] hover:text-white"><PanelRight size={17} /></button>
      </div>
      <div className="p-4 pb-3">
        <button onClick={onAdd} className="flex w-full items-center justify-center gap-2 rounded-full border border-[#3c414b] bg-[#23262b] py-2.5 text-sm font-medium text-[#e7e9ee] transition hover:border-[#6c7fae] hover:bg-[#2c3038]">
          <Plus size={16} /> Add sources
        </button>
        <div className="mt-4 rounded-2xl border border-[#3b3f48] bg-[#24272d] p-3">
          <div className="flex items-center gap-2 border-b border-[#383c45] pb-3">
            <Search size={16} className="shrink-0 text-[#949ba7]" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search these sources" className="w-full bg-transparent text-[13px] text-[#edf0f4] outline-none placeholder:text-[#858c98]" />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button onClick={() => onToast("Source type: web")} className="flex items-center gap-1.5 rounded-full bg-[#30343b] px-2.5 py-1.5 text-xs text-[#dce0e6]"><Globe2 size={13} /> Web <ChevronDown size={13} /></button>
            <button onClick={() => onToast("Quick scan mode selected")} className="flex items-center gap-1.5 rounded-full bg-[#30343b] px-2.5 py-1.5 text-xs text-[#dce0e6]"><Sparkles size={13} className="text-[#9fbcff]" /> Quick scan <ChevronDown size={13} /></button>
            <button onClick={() => onToast("Searching the web") } className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-[#343941] text-[#b3bdd0] hover:bg-[#495263]"><Search size={14} /></button>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between px-4 pb-2 text-xs text-[#8f96a3]">
        <div className="flex items-center gap-3">
          <button onClick={() => onToast("Source actions opened")}><MoreVertical size={15} /></button>
          <button onClick={() => onToast("Sources sorted by relevance")}><SlidersHorizontal size={15} /></button>
        </div>
        <button onClick={toggleAll} className="flex items-center gap-2 text-[#cbd0d8] hover:text-white">
          {allSelected ? "Deselect all" : "Select all"}
          <span className={`flex h-4 w-4 items-center justify-center rounded border ${allSelected ? "border-[#8baeff] bg-[#6f91e9] text-[#202226]" : "border-[#656b78]"}`}>{allSelected && <Check size={11} strokeWidth={3} />}</span>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-5 [scrollbar-color:#454b57_transparent] [scrollbar-width:thin]">
        {filtered.map((source) => {
          const sourceIndex = sources.indexOf(source);
          const isSelected = selected.has(sourceIndex);
          return (
            <button key={source.title} onClick={() => setSelected((previous) => { const next = new Set(previous); if (next.has(sourceIndex)) next.delete(sourceIndex); else next.add(sourceIndex); return next; })} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-[#292c32] ${isSelected ? "" : "opacity-55"}`}>
              <SourceGlyph kind={source.kind} color={source.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-[#d8dbe1]">{source.title}</span>
                <span className="mt-0.5 block truncate text-[10px] text-[#858d9a]">{source.domain}</span>
              </span>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isSelected ? "border-[#8caeff] bg-[#708fe1] text-[#182030]" : "border-[#656c77] text-transparent"}`}>
                <Check size={12} strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}