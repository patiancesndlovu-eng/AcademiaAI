import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { X, PanelLeft, PanelRight, Loader2 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Toast } from "@/components/common/Toast";
import { IconButton } from "@/components/common/Primitives";
import { SourcesRail } from "@/components/workspace/SourcesRail";
import { ChatCanvas } from "@/components/workspace/ChatCanvas";
import { StudioRail } from "@/components/workspace/StudioRail";
import { AddSourcesModal } from "@/components/workspace/AddSourcesModal";
import { getNotebook, getSources } from "@/lib/api";

export default function NotebookWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [notebook, setNotebook] = useState<any>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [modal, setModal] = useState<"sources" | null>(null);
  const [addSourcesMode, setAddSourcesMode] = useState<"url" | "text" | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"sources" | "studio" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [studioOpen, setStudioOpen] = useState(true);
  const [promptSeed, setPromptSeed] = useState<{ text: string; id: number } | null>(null);
  const pollTimersRef = useRef<number[]>([]);

  useEffect(() => {
    const timers = pollTimersRef.current;
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers.length = 0;
    };
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        setLoadError(null);
        const [nb, srcRes] = await Promise.all([
          getNotebook(id!),
          getSources(id!, { pageSize: 100 }),
        ]);
        if (!cancelled) {
          setNotebook(nb);
          setSources(srcRes?.data || []);
        }
      } catch (e: any) {
        if (!cancelled) {
          setLoadError(e.message || "Failed to load notebook");
          setToast(e.message || "Failed to load notebook");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id, reloadKey]);

  useEffect(() => {
    if (mobilePanel) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = original; };
    }
  }, [mobilePanel]);

  useEffect(() => {
    if (!mobilePanel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobilePanel(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobilePanel]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const createNotebook = () => {
    navigate("/");
  };

  const handleSourcesChanged = (newSources: any[]) => {
    setSources(newSources);
  };

  const toggleSources = () => {
    // Mobile drawer open? Just close it. Otherwise toggle the desktop rail.
    if (mobilePanel) setMobilePanel(null);
    else setSourcesOpen((prev) => !prev);
  };

  const toggleStudio = () => {
    if (mobilePanel) setMobilePanel(null);
    else setStudioOpen((prev) => !prev);
  };

  const handleSourcesAdded = (s: any[]) => {
    // Merge by id — never duplicate entries when overlapping
    // imports/polls resolve out of order.
    setSources((prev) => {
      const known = new Set(prev.map((x: any) => x.id));
      const fresh = s.filter((x: any) => !known.has(x.id));
      return [...fresh, ...prev];
    });
    setModal(null);
    setAddSourcesMode(null);
    // Ingestion runs in the worker; refetch until new sources settle.
    // ponytail: fixed 5s x12 poll, replace with SSE/push when the backend supports it.
    const ids = new Set(s.map((x: any) => x.id));
    let rounds = 0;
    const poll = async () => {
      rounds += 1;
      try {
        const fresh = await getSources(notebook.id, { pageSize: 100 });
        setSources(fresh?.data || []);
        const pending = (fresh?.data || []).some((x: any) => ids.has(x.id) && (x.status === 'queued' || x.status === 'processing'));
        if (!pending || rounds >= 12) return;
      } catch {
        if (rounds >= 12) return;
      }
      pollTimersRef.current.push(window.setTimeout(poll, 5000));
    };
    pollTimersRef.current.push(window.setTimeout(poll, 5000));
  };

  const selectedSourceCount = sources.filter((s) => s.selected).length;

  if (loading) {
    return (
      <div className="flex h-[100dvh] min-h-[540px] flex-col items-center justify-center bg-[#202226] text-[#eef0f4]">
        <Loader2 size={32} className="animate-spin text-[#7ea7ff]" />
        <p className="mt-4 text-sm text-[#9fa6b3]">Loading notebook…</p>
      </div>
    );
  }

  if (!notebook) {
    return (
      <div className="flex h-[100dvh] min-h-[540px] flex-col items-center justify-center bg-[#202226] px-6 text-center text-[#eef0f4]">
        <p className="text-lg text-[#f0f2f6]">{loadError ? "Couldn't load this notebook" : "Notebook not found"}</p>
        {loadError && <p className="mt-2 max-w-[420px] text-sm text-[#9fa6b3]">{loadError}</p>}
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {loadError && (
            <button onClick={() => setReloadKey((k) => k + 1)} className="rounded-full bg-[#6f8ff0] px-5 py-2.5 text-sm font-semibold text-[#141b2d] transition hover:bg-[#92abff] active:scale-[0.98]">Retry</button>
          )}
          <button onClick={() => navigate('/')} className="rounded-full border border-[#4b515c] px-5 py-2.5 text-sm text-[#d2d5dc] transition hover:bg-[#2c3037]">Back to dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] min-h-[540px] flex-col overflow-hidden bg-[#202226] text-[#eef0f4]">
      <TopBar
        mode="notebook"
        notebookTitle={notebook.title}
        notebook={notebook}
        sources={sources}
        onCreate={createNotebook}
        onToast={showToast}
        onNotebookUpdated={(updated) => setNotebook(updated)}
        onNotebookDeleted={() => {
          showToast("Notebook deleted");
          navigate("/");
        }}
      />

      <div className="flex items-center gap-2 border-b border-[#30343b] bg-[#202226] px-4 py-2 xl:hidden">
        <button onClick={() => setMobilePanel((prev) => (prev === "sources" ? null : "sources"))} aria-expanded={mobilePanel === "sources"} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#2c3037] py-2 text-xs text-[#dce0e7] transition active:scale-[0.98]">
          <PanelLeft size={14} /> Sources
        </button>
        <button onClick={() => setMobilePanel((prev) => (prev === "studio" ? null : "studio"))} aria-expanded={mobilePanel === "studio"} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#2c3037] py-2 text-xs text-[#dce0e7] transition active:scale-[0.98]">
          <PanelRight size={14} /> Studio
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col xl:flex-row">
        <div className={`
          z-30 flex shrink-0 flex-col bg-[#1e2024] xl:w-[300px] xl:border-r xl:border-[#30343b]
          ${mobilePanel === "sources" ? "fixed inset-y-0 left-0 w-[85vw] max-w-[320px] shadow-2xl xl:static xl:shadow-none" : "hidden"}
          ${sourcesOpen ? "xl:flex" : "xl:hidden"}
        `}>
          {mobilePanel === "sources" && (
            <div className="absolute right-3 top-3 z-10 xl:hidden">
              <IconButton label="Close sources" onClick={() => setMobilePanel(null)}><X size={18} /></IconButton>
            </div>
          )}
          <SourcesRail
            notebookId={notebook.id}
            sources={sources}
            onSourcesChanged={handleSourcesChanged}
            onSourcesAdded={handleSourcesAdded}
            onAdd={(mode) => { setAddSourcesMode(mode ?? null); setModal("sources"); }}
            onToggle={toggleSources}
            onToast={showToast}
          />
        </div>
        {!sourcesOpen && (
          <div className="hidden w-[52px] shrink-0 flex-col items-center gap-4 border-r border-[#30343b] bg-[#1e2024] py-4 xl:flex">
            <IconButton label="Show Sources panel" onClick={() => setSourcesOpen(true)}><PanelLeft size={17} /></IconButton>
            <span className="text-[10px] uppercase tracking-[0.16em] text-[#7e8693] [writing-mode:vertical-rl]">Sources</span>
          </div>
        )}
        {mobilePanel === "sources" && (
          <div className="fixed inset-0 z-20 bg-black/60 xl:hidden" onClick={() => setMobilePanel(null)} />
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ChatCanvas notebook={notebook} sources={sources} promptSeed={promptSeed} onToast={showToast} />
        </div>

        <div className={`
          z-30 flex shrink-0 flex-col bg-[#1e2024] xl:w-[318px] xl:border-l xl:border-[#30343b]
          ${mobilePanel === "studio" ? "fixed inset-y-0 right-0 w-[85vw] max-w-[340px] shadow-2xl xl:static xl:shadow-none" : "hidden"}
          ${studioOpen ? "xl:flex" : "xl:hidden"}
        `}>
          {mobilePanel === "studio" && (
            <div className="absolute left-3 top-3 z-10 xl:hidden">
              <IconButton label="Close Studio" onClick={() => setMobilePanel(null)}><X size={18} /></IconButton>
            </div>
          )}
          <StudioRail
            notebookId={notebook.id}
            sources={sources}
            onToggle={toggleStudio}
            onUsePrompt={(text) => setPromptSeed({ text, id: Date.now() })}
            onToast={showToast}
            selectedSourceCount={selectedSourceCount}
          />
        </div>
        {!studioOpen && (
          <div className="hidden w-[52px] shrink-0 flex-col items-center gap-4 border-l border-[#30343b] bg-[#1e2024] py-4 xl:flex">
            <IconButton label="Show Studio panel" onClick={() => setStudioOpen(true)}><PanelRight size={17} /></IconButton>
            <span className="text-[10px] uppercase tracking-[0.16em] text-[#7e8693] [writing-mode:vertical-rl]">Studio</span>
          </div>
        )}
        {mobilePanel === "studio" && (
          <div className="fixed inset-0 z-20 bg-black/60 xl:hidden" onClick={() => setMobilePanel(null)} />
        )}
      </div>

      {modal === "sources" && (
        <AddSourcesModal
          notebookId={notebook.id}
          initialMode={addSourcesMode}
          onClose={() => { setModal(null); setAddSourcesMode(null); }}
          onSourcesAdded={handleSourcesAdded}
          onToast={showToast}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}