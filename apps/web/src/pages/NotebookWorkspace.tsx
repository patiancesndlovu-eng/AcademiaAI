import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { X, PanelLeft, PanelRight, Loader2 } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Toast } from "@/components/common/Toast";
import { IconButton } from "@/components/common/Primitives";
import { SourcesRail } from "@/components/workspace/SourcesRail";
import { ChatCanvas } from "@/components/workspace/ChatCanvas";
import { StudioRail, type StudioOutput } from "@/components/workspace/StudioRail";
import { AddSourcesModal } from "@/components/workspace/AddSourcesModal";
import { getNotebook, getSources } from "@/lib/api";

const outputsStorageKey = (notebookId: string) => `academiaai:studio-outputs:${notebookId}`;

function loadOutputs(notebookId: string): StudioOutput[] {
  try {
    const raw = localStorage.getItem(outputsStorageKey(notebookId));
    return raw ? (JSON.parse(raw) as StudioOutput[]) : [];
  } catch {
    return [];
  }
}

export default function NotebookWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [notebook, setNotebook] = useState<any>(null);
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"sources" | null>(null);
  const [addSourcesMode, setAddSourcesMode] = useState<"url" | "text" | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"sources" | "studio" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [studioOpen, setStudioOpen] = useState(true);
  const [promptSeed, setPromptSeed] = useState<{ text: string; id: number } | null>(null);
  const [studioOutputs, setStudioOutputs] = useState<StudioOutput[]>([]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const [nb, srcRes] = await Promise.all([
          getNotebook(id!),
          getSources(id!, { pageSize: 100 }),
        ]);
        if (!cancelled) {
          setNotebook(nb);
          setSources(srcRes?.data || []);
          setStudioOutputs(loadOutputs(nb.id));
        }
      } catch (e: any) {
        if (!cancelled) setToast(e.message || "Failed to load notebook");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [id]);

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

  useEffect(() => {
    if (notebook?.id) {
      localStorage.setItem(outputsStorageKey(notebook.id), JSON.stringify(studioOutputs));
    }
  }, [studioOutputs, notebook?.id]);

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
    setMobilePanel((prev) => (prev === "sources" ? null : prev));
    setSourcesOpen((prev) => !prev);
  };

  const toggleStudio = () => {
    setMobilePanel((prev) => (prev === "studio" ? null : prev));
    setStudioOpen((prev) => !prev);
  };

  const addStudioOutput = (output: Omit<StudioOutput, "id" | "createdAt">) => {
    setStudioOutputs((prev) => [
      { ...output, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, createdAt: Date.now() },
      ...prev,
    ]);
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
      <div className="flex h-[100dvh] min-h-[540px] flex-col items-center justify-center bg-[#202226] text-[#eef0f4]">
        <p className="text-lg text-[#f0f2f6]">Notebook not found</p>
        <button onClick={() => navigate('/')} className="mt-4 rounded-full bg-[#6f8ff0] px-5 py-2.5 text-sm font-semibold text-[#141b2d]">Back to dashboard</button>
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
          <ChatCanvas notebook={notebook} sources={sources} promptSeed={promptSeed} />
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
            onAddNote={(text) => {
              addStudioOutput({ kind: "note", title: "Note", detail: text });
              showToast("Note saved to Studio");
            }}
            outputs={studioOutputs}
            onRemoveOutput={(outputId) => setStudioOutputs((prev) => prev.filter((o) => o.id !== outputId))}
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
          onSourcesAdded={(s) => { setSources((prev) => [...prev, ...s]); setModal(null); setAddSourcesMode(null); }}
          onToast={showToast}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}