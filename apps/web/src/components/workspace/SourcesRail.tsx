import { useMemo, useState, useEffect, useRef } from "react";
import { Plus, Search, Sparkles, Globe2, ChevronDown, PanelLeft, SlidersHorizontal, MoreVertical, Check, Loader2, Download, ExternalLink, Trash2, RotateCcw, ArrowRight, AlertCircle } from "lucide-react";
import { SourceGlyph } from "@/components/common/Primitives";
import { Popover, PopoverItem } from "@/components/common/Popover";
import { batchSelectSources, deleteSource, retrySource, searchWebSources, addUrlSource, type WebSearchResult } from "@/lib/api";

interface SourcesRailProps {
  notebookId: string;
  sources: any[];
  onSourcesChanged: (sources: any[]) => void;
  onSourcesAdded?: (sources: any[]) => void;
  onAdd: (mode?: "url" | "text") => void;
  onToggle: () => void;
  onToast: (message: string) => void;
}

/** Frontend mirror of the backend canonicalizer — same rules, no query stripping. */
function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    const isDefaultPort = (u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443");
    let path = u.pathname;
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    return `${u.protocol}//${host}${u.port && !isDefaultPort ? `:${u.port}` : ""}${path}${u.search}${u.hash}`;
  } catch {
    return null;
  }
}

function mapSearchError(e: any): string {
  switch (e?.code) {
    case "SEARCH_DISABLED":
      return "Web search is currently unavailable.";
    case "SEARCH_TIMEOUT":
      return "Web search timed out. Try again.";
    case "RATE_LIMITED":
      return "Too many searches. Please wait a moment and try again.";
    default:
      return "We couldn't search the web right now.";
  }
}

/** Bounded parallel runner — never Promise.all(100 URLs). */
async function runPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
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

export function SourcesRail({ notebookId, sources, onSourcesChanged, onSourcesAdded, onAdd, onToggle, onToast }: SourcesRailProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Mirror of `selected` for async handlers: rapid toggles read the latest
  // value instead of a stale closure, so no toggle is lost.
  const selectedRef = useRef<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
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

  // Web search state (moved here from AddSourcesModal — rail owns discovery now)
  const [results, setResults] = useState<WebSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [importing, setImporting] = useState(false);
  const searchReqRef = useRef(0);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      searchReqRef.current += 1;
      searchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const next = new Set(sources.filter((s) => s.selected).map((s) => s.id));
    selectedRef.current = next;
    setSelected(next);
  }, [sources]);

  /* Local sort + type/scope filter (web search replaced the text filter) */
  const filtered = useMemo(() => {
    let list = sources.filter((source) => {
      const matchesType = !typeFilter || source.type === typeFilter;
      const matchesScope = scopeFilter === "all" || selected.has(source.id);
      return matchesType && matchesScope;
    });
    if (sortBy === "title") {
      list.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    } else if (sortBy === "date") {
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }
    return list;
  }, [sources, sortBy, typeFilter, scopeFilter, selected]);

  const existingUrls = useMemo(() => {
    const set = new Set<string>();
    for (const s of sources) {
      if (!s?.canonicalUrl) continue;
      const n = normalizeUrl(s.canonicalUrl);
      if (n) set.add(n);
    }
    return set;
  }, [sources]);

  const isAlreadyImported = (url: string) => {
    const n = normalizeUrl(url);
    return n ? existingUrls.has(n) : false;
  };

  const doSearch = async () => {
    const q = query.trim();
    if (q.length < 2 || searching || importing) return;
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    const req = ++searchReqRef.current;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await searchWebSources(notebookId, q, 8, controller.signal);
      if (searchReqRef.current !== req) return; // stale — a newer search won
      setResults(res.results ?? []);
      setHasSearched(true);
    } catch (e: any) {
      if (controller.signal.aborted || searchReqRef.current !== req) return;
      setResults([]);
      setHasSearched(true);
      setSearchError(mapSearchError(e));
    } finally {
      if (searchReqRef.current === req) setSearching(false);
    }
  };

  const clearSearch = () => {
    searchReqRef.current += 1;
    searchAbortRef.current?.abort();
    setResults([]);
    setSearchError(null);
    setHasSearched(false);
  };

  const freshResults = results.filter((r) => !isAlreadyImported(r.url));

  const handleImportAll = async () => {
    if (freshResults.length === 0 || importing || searching) return;
    setImporting(true);
    const created: any[] = [];
    let duplicates = 0;
    let failed = 0;
    let lastError = "";
    await runPool(freshResults, 3, async (r) => {
      try {
        created.push(await addUrlSource(notebookId, { url: r.url, title: r.title }));
      } catch (e: any) {
        if (e?.code === "CONFLICT") duplicates += 1;
        else {
          failed += 1;
          lastError = e?.message || "Import failed";
        }
      }
    });
    setImporting(false);
    if (created.length > 0) {
      const parts = [`${created.length} source${created.length === 1 ? "" : "s"} imported`];
      if (duplicates > 0) parts.push(`${duplicates} already in notebook`);
      if (failed > 0) parts.push(`${failed} failed`);
      onToast(parts.join(" · "));
      clearSearch();
      // ponytail: route through parent poll when available so queued imports settle to ready; direct prepend otherwise.
      if (onSourcesAdded) onSourcesAdded(created);
      else onSourcesChanged([...created, ...sources]);
    } else if (duplicates > 0 || freshResults.length === 0) {
      onToast("Already in this notebook");
    } else {
      onToast(lastError || "Import failed");
    }
  };

  const allSelected = filtered.length > 0 && filtered.every((source) => selected.has(source.id));
  const linkedSources = useMemo(() => sources.filter((s) => s.canonicalUrl), [sources]);

  const toggleAll = async () => {
    const current = selectedRef.current;
    const targetIds = filtered.map((s) => s.id);
    const next = new Set(current);
    if (allSelected) {
      targetIds.forEach((id) => next.delete(id));
    } else {
      targetIds.forEach((id) => next.add(id));
    }
    selectedRef.current = next;
    setSelected(next);
    try {
      setSyncing(true);
      await batchSelectSources(notebookId, { sourceIds: targetIds, selected: !allSelected });
      onSourcesChanged(sources.map((s) => ({ ...s, selected: next.has(s.id) })));
    } catch (e: any) {
      onToast("Failed to update selection");
      const revert = new Set(sources.filter((s) => s.selected).map((s) => s.id));
      selectedRef.current = revert;
      setSelected(revert);
    } finally {
      setSyncing(false);
    }
  };

  const toggleOne = async (id: string) => {
    const current = selectedRef.current;
    const next = new Set(current);
    const isSelected = next.has(id);
    if (isSelected) next.delete(id);
    else next.add(id);
    selectedRef.current = next;
    setSelected(next);
    try {
      await batchSelectSources(notebookId, { sourceIds: [id], selected: !isSelected });
      onSourcesChanged(sources.map((s) => ({ ...s, selected: next.has(s.id) })));
    } catch (e: any) {
      onToast("Failed to update selection");
      const revert = new Set(sources.filter((s) => s.selected).map((s) => s.id));
      selectedRef.current = revert;
      setSelected(revert);
    }
  };

  const sourceTypes = useMemo(() => {
    const types = new Set<string>();
    sources.forEach((s) => types.add(s.type));
    return Array.from(types);
  }, [sources]);

  const handleDelete = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      await deleteSource(id);
      onSourcesChanged(sources.filter((s) => s.id !== id));
      onToast("Source deleted");
    } catch (e: any) {
      onToast(e?.message || "Failed to delete source");
    } finally {
      setBusyId(null);
    }
  };

  const handleRetry = async (id: string) => {
    if (busyId) return;
    setBusyId(id);
    try {
      const updated = await retrySource(id);
      onSourcesChanged(sources.map((s) => (s.id === id ? { ...s, status: updated.status ?? 'queued', processingError: null } : s)));
      onToast("Source requeued for processing");
    } catch (e: any) {
      onToast(e?.message || "Failed to retry source");
    } finally {
      setBusyId(null);
    }
  };

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
    linkedSources.forEach((source) => window.open(source.canonicalUrl, "_blank", "noopener,noreferrer"));
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
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) doSearch(); }}
              placeholder="Search the web for new sources"
              aria-label="Search the web for new sources"
              className="w-full bg-transparent text-[13px] text-[#edf0f4] outline-none placeholder:text-[#858c98] focus:outline-none"
            />
            <button
              onClick={doSearch}
              disabled={query.trim().length < 2 || searching || importing}
              aria-label="Search the web"
              title="Search the web"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#343941] text-[#b3bdd0] transition hover:bg-[#495263] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {searching ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
            </button>
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
          </div>
        </div>
        {(searching || searchError || hasSearched) && (
          <div className="mt-3 rounded-2xl border border-[#3b3f48] bg-[#24272d] p-3">
            {searching && (
              <p className="flex items-center gap-2 text-[13px] text-[#9ba2ae]"><Loader2 size={14} className="animate-spin" /> Researching websites…</p>
            )}
            {searchError && !searching && (
              <div className="flex items-start gap-2 rounded-xl border border-[#c05a5a] bg-[#2d2426] p-3 text-sm text-[#f0d0d0]">
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span className="min-w-0 flex-1">{searchError}</span>
                <button onClick={doSearch} className="shrink-0 text-xs underline hover:text-white">Retry</button>
              </div>
            )}
            {!searching && !searchError && hasSearched && results.length === 0 && (
              <p className="text-[13px] text-[#9ba2ae]">No results found for this search. Try different keywords.</p>
            )}
            {!searching && !searchError && results.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#858c98]">Web search completed!</p>
                  <button onClick={clearSearch} disabled={importing} className="text-xs text-[#cbd0d8] transition hover:text-white disabled:opacity-50">Delete</button>
                </div>
                <div className="max-h-[260px] space-y-2 overflow-y-auto pr-0.5">
                  {results.slice(0, 3).map((r) => {
                    const already = isAlreadyImported(r.url);
                    return (
                      <div key={r.url} className={already ? "opacity-55" : ""}>
                        <p className="truncate text-[13px] font-medium text-[#e4e7ec]">{r.title}</p>
                        {r.snippet && <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-[#9ba2ae]">{r.snippet}</p>}
                        {already && <span className="mt-1 inline-block rounded bg-[#30343b] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#9ebaff]">Already imported</span>}
                      </div>
                    );
                  })}
                  {results.length > 3 && (
                    <p className="text-[12px] text-[#858d9a]">{results.length - 3} more source{results.length - 3 === 1 ? "" : "s"}</p>
                  )}
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    disabled={freshResults.length === 0 || importing || searching}
                    onClick={handleImportAll}
                    className="inline-flex items-center gap-2 rounded-full bg-[#6f8ff0] px-5 py-2 text-[13px] font-semibold text-[#141b2d] transition hover:bg-[#92abff] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {importing ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                    {importing ? "Importing…" : freshResults.length > 0 ? "Import" : "Imported"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
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
        {filtered.length === 0 && sources.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-[#858d9a]">
            No sources yet. Click "Add sources" to get started.
          </div>
        )}
        {filtered.length === 0 && sources.length > 0 && (typeFilter || scopeFilter === "selected") && (
          <div className="px-4 py-8 text-center text-xs text-[#858d9a]">
            No sources match your filters.
          </div>
        )}
        {filtered.map((source) => {
          const isSelected = selected.has(source.id);
          const isBusy = busyId === source.id;
          const isFailed = source.status === 'failed';
          const isProcessing = source.status === 'queued' || source.status === 'processing';
          return (
            <div key={source.id} className={`flex w-full items-center gap-1.5 rounded-xl px-2.5 py-2 transition hover:bg-[#292c32] ${isSelected ? "" : "opacity-55"}`}>
              <button onClick={() => toggleOne(source.id)} aria-pressed={isSelected} aria-label={`${isSelected ? "Deselect" : "Select"} ${source.title}`} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                <SourceGlyph kind={mapTypeToKind(source.type)} color={source.domain ? stringToColor(source.domain) : stringToColor(source.type)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12px] text-[#d8dbe1]">{source.title}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-[#858d9a]">
                    {isFailed ? "Processing failed" : isProcessing ? `Processing…${typeof source.progress === 'number' ? ` ${source.progress}%` : ''}` : (source.domain || source.type)}
                  </span>
                  {isFailed && (
                    <span className="mt-0.5 block truncate text-[10px] text-[#e8b9b9]">
                      {source.processingError || "Something went wrong during processing"}
                    </span>
                  )}
                </span>
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${isSelected ? "border-[#8caeff] bg-[#708fe1] text-[#182030]" : "border-[#656c77] text-transparent"}`}>
                  <Check size={12} strokeWidth={3} />
                </span>
              </button>
              {isFailed && (
                <button onClick={() => handleRetry(source.id)} disabled={isBusy} aria-label={`Retry ${source.title}`} title="Retry processing" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#9ebaff] transition hover:bg-[#2c3037] hover:text-white disabled:opacity-40">
                  {isBusy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                </button>
              )}
              <button onClick={() => handleDelete(source.id)} disabled={isBusy} aria-label={`Delete ${source.title}`} title="Delete source" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#7e8693] transition hover:bg-[#2c3037] hover:text-white disabled:opacity-40">
                {isBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
              </button>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
