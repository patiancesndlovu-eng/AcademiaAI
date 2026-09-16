import { useMemo, useState, useEffect, useRef } from "react";
import { Plus, Search, Sparkles, Globe2, ChevronDown, PanelLeft, SlidersHorizontal, MoreVertical, Check, Loader2, Download, ExternalLink } from "lucide-react";
import { SourceGlyph } from "@/components/common/Primitives";
import { Popover, PopoverItem } from "@/components/common/Popover";
import { batchSelectSources } from "@/lib/api";

interface SourcesRailProps {
  notebookId: string;
  sources: any[];
  onSourcesChanged: (sources: any[]) => void;
  onAdd: (mode?: "url" | "text") => void;
  onToggle: () => void;
  onToast: (message: string) => void;
}

function mapTypeToKind(type: string): string {
  switch (type) {
    case 'url': return 'article';
    case 'text': return 'guide';
    case 'upload': return 'book';
    case 'drive': return 'paper';
    default: return 'article';
  }
}

function stringToColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
  return '#' + '00000'.substring(0, 6 - c.length) + c;
}

function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function SourcesRail({ notebookId, sources, onSourcesChanged, onAdd, onToggle, onToast }: SourcesRailProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [sortBy, setSortBy] = useState<"relevance" | "date" | "title">("relevance");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<"all" | "selected">("all");
  const [typeOpen, setTypeOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const typeRef = useRef<HTMLButtonElement>(null);
  const scopeRef = useRef<HTMLButtonElement>(null);
  const sortRef = useRef<HTMLButtonElement>(null);
  const actionsRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setSelected(new Set(sources.filter((s) => s.selected).map((s) => s.id)));
  }, [sources]);

  /* Local filter + sort */
  const filtered = useMemo(() => {
    let list = sources.filter((source) => {
      const matchesQuery = !query.trim() ||
        source.title?.toLowerCase().includes(query.toLowerCase()) ||
        source.domain?.toLowerCase().includes(query.toLowerCase());
      const matchesType = !typeFilter || source.type === typeFilter;
      const matchesScope = scopeFilter === "all" || selected.has(source.id);
      return matchesQuery && matchesType && matchesScope;
    });
    if (sortBy === "title") {
      list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (sortBy === "date") {
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }
    return list;
  }, [sources, query, sortBy, typeFilter, scopeFilter, selected]);

  const allSelected = filtered.length > 0 && filtered.every((source) => selected.has(source.id));
  const linkedSources = useMemo(() => sources.filter((s) => s.url), [sources]);

  const toggleAll = async () => {
    const next = new Set(selected);
    const targetIds = filtered.map((s) => s.id);
    if (allSelected) {
      targetIds.forEach((id) => next.delete(id));
    } else {
      targetIds.forEach((id) => next.add(id));
    }
    setSelected(next);
    try {
      setSyncing(true);
      await batchSelectSources(notebookId, { sourceIds: targetIds, selected: !allSelected });
      onSourcesChanged(sources.map((s) => ({ ...s, selected: next.has(s.id) })));
    } catch (e: any) {
      onToast("Failed to update selection");
      setSelected(new Set(sources.filter((s) => s.selected).map((s) => s.id)));
    } finally {
      setSyncing(false);
    }
  };

  const toggleOne = async (id: string) => {
    const next = new Set(selected);
    const isSelected = next.has(id);
    if (isSelected) next.delete(id);
    else next.add(id);
    setSelected(next);
    try {
      await batchSelectSources(notebookId, { sourceIds: [id], selected: !isSelected });
      onSourcesChanged(sources.map((s) => ({ ...s, selected: next.has(s.id) })));
    } catch (e: any) {
      onToast("Failed to update selection");
      setSelected(new Set(sources.filter((s) => s.selected).map((s) => s.id)));
    }
  };

  const sourceTypes = useMemo(() => {
    const types = new Set<string>();
    sources.forEach((s) => types.add(s.type));
    return Array.from(types);
  }, [sources]);

  const exportSources = () => {
    setActionsOpen(false);
    const blob = new Blob([JSON.stringify(sources, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sources-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const openLinkedSources = () => {
    setActionsOpen(false);
    linkedSources.forEach((source) => window.open(source.url, "_blank", "noopener,noreferrer"));
  };

  return (
    <aside className="flex min-h-0 w-full flex-col border-b border-[#30343b] bg-[#1e2024] xl:w-[300px] xl:border-b-0 xl:border-r">
      <div className="flex items-center justify-between border-b border-[#30343b] px-4 py-4">
        <h2 className="font-display text-[16px] text-[#e8ebf0]">Sources</h2>
        <button onClick={onToggle} aria-expanded="true" aria-label="Hide Sources panel" title="Hide Sources panel" className="text-[#aeb4bf] transition hover:text-white"><PanelLeft size={17} /></button>
      </div>
      <div className="p-4 pb-3">
        <button onClick={() => onAdd()} className="flex w-full items-center justify-center gap-2 rounded-full border border-[#3c414b] bg-[#23262b] py-2.5 text-sm font-medium text-[#e7e9ee] transition hover:border-[#6c7fae] hover:bg-[#2c3038] active:scale-[0.98]">
          <Plus size={16} /> Add sources
        </button>
        <div className="mt-4 rounded-2xl border border-[#3b3f48] bg-[#24272d] p-3">
          <div className="flex items-center gap-2 border-b border-[#383c45] pb-3">
            <Search size={16} className="shrink-0 text-[#949ba7]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search these sources"
              className="w-full bg-transparent text-[13px] text-[#edf0f4] outline-none placeholder:text-[#858c98] focus:outline-none"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            {/* Type filter dropdown */}
            <div className="relative">
              <button ref={typeRef} onClick={() => setTypeOpen((v) => !v)} aria-expanded={typeOpen} className="flex items-center gap-1.5 rounded-full bg-[#30343b] px-2.5 py-1.5 text-xs text-[#dce0e6] transition hover:bg-[#3a3f49]">
                <Globe2 size={13} /> {typeFilter ? capitalize(typeFilter) : "All types"} <ChevronDown size={13} />
              </button>
              <Popover open={typeOpen} onClose={() => setTypeOpen(false)} anchorRef={typeRef} className="w-36">
                <PopoverItem active={!typeFilter} onClick={() => { setTypeFilter(null); setTypeOpen(false); }}>All types</PopoverItem>
                {sourceTypes.map((t) => (
                  <PopoverItem key={t} active={typeFilter === t} onClick={() => { setTypeFilter(t); setTypeOpen(false); }}>{capitalize(t)}</PopoverItem>
                ))}
              </Popover>
            </div>
            {/* Scope filter: all sources vs. selected only */}
            <div className="relative">
              <button ref={scopeRef} onClick={() => setScopeOpen((v) => !v)} aria-expanded={scopeOpen} className="flex items-center gap-1.5 rounded-full bg-[#30343b] px-2.5 py-1.5 text-xs text-[#dce0e6] transition hover:bg-[#3a3f49]">
                <Sparkles size={13} className="text-[#9fbcff]" /> {scopeFilter === "selected" ? "Selected only" : "All sources"} <ChevronDown size={13} />
              </button>
              <Popover open={scopeOpen} onClose={() => setScopeOpen(false)} anchorRef={scopeRef} className="w-40">
                <PopoverItem active={scopeFilter === "all"} onClick={() => { setScopeFilter("all"); setScopeOpen(false); }}>All sources</PopoverItem>
                <PopoverItem active={scopeFilter === "selected"} onClick={() => { setScopeFilter("selected"); setScopeOpen(false); }}>Selected only</PopoverItem>
              </Popover>
            </div>
            <button onClick={() => onAdd("url")} aria-label="Add a web source" title="Add a web source" className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-[#343941] text-[#b3bdd0] transition hover:bg-[#495263]"><Search size={14} /></button>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between px-4 pb-2 text-xs text-[#8f96a3]">
        <div className="flex items-center gap-1">
          {/* Actions dropdown */}
          <div className="relative">
            <button ref={actionsRef} onClick={() => setActionsOpen((v) => !v)} aria-expanded={actionsOpen} aria-label="Source actions" className="rounded-full p-1.5 transition hover:bg-[#2c3037] hover:text-white"><MoreVertical size={15} /></button>
            <Popover open={actionsOpen} onClose={() => setActionsOpen(false)} anchorRef={actionsRef} className="w-44">
              <PopoverItem icon={<Download size={14} />} disabled={sources.length === 0} onClick={exportSources}>Export JSON</PopoverItem>
              <PopoverItem icon={<ExternalLink size={14} />} disabled={linkedSources.length === 0} onClick={openLinkedSources}>Open all links</PopoverItem>
            </Popover>
          </div>
          {/* Sort dropdown */}
          <div className="relative">
            <button ref={sortRef} onClick={() => setSortOpen((v) => !v)} aria-expanded={sortOpen} aria-label="Sort sources" className="rounded-full p-1.5 transition hover:bg-[#2c3037] hover:text-white"><SlidersHorizontal size={15} /></button>
            <Popover open={sortOpen} onClose={() => setSortOpen(false)} anchorRef={sortRef} className="w-36">
              {(["relevance", "date", "title"] as const).map((s) => (
                <PopoverItem key={s} active={sortBy === s} onClick={() => { setSortBy(s); setSortOpen(false); }}>{capitalize(s)}</PopoverItem>
              ))}
            </Popover>
          </div>
        </div>
        <button onClick={toggleAll} disabled={syncing} className="flex items-center gap-2 text-[#cbd0d8] transition hover:text-white disabled:opacity-50">
          {allSelected ? "Deselect all" : "Select all"}
          {syncing ? <Loader2 size={14} className="animate-spin" /> : (
            <span className={`flex h-4 w-4 items-center justify-center rounded border ${allSelected ? "border-[#8baeff] bg-[#6f91e9] text-[#202226]" : "border-[#656b78]"}`}>
              {allSelected && <Check size={11} strokeWidth={3} />}
            </span>
          )}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-5 [scrollbar-color:#454b57_transparent] [scrollbar-width:thin]">
        {filtered.length === 0 && !query && sources.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-[#858d9a]">
            No sources yet. Click "Add sources" to get started.
          </div>
        )}
        {filtered.length === 0 && (query || typeFilter || scopeFilter === "selected") && (
          <div className="px-4 py-8 text-center text-xs text-[#858d9a]">
            No sources match your filters.
          </div>
        )}
        {filtered.map((source) => {
          const isSelected = selected.has(source.id);
          return (
            <button key={source.id} onClick={() => toggleOne(source.id)} className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-[#292c32] ${isSelected ? "" : "opacity-55"}`}>
              <SourceGlyph kind={mapTypeToKind(source.type)} color={source.domain ? stringToColor(source.domain) : stringToColor(source.type)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] text-[#d8dbe1]">{source.title}</span>
                <span className="mt-0.5 block truncate text-[10px] text-[#858d9a]">{source.domain || source.type}</span>
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
