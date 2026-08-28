import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { X, PanelLeft, PanelRight } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Toast } from "@/components/common/Toast";
import { IconButton } from "@/components/common/Primitives";
import { SourcesRail } from "@/components/workspace/SourcesRail";
import { ChatCanvas } from "@/components/workspace/ChatCanvas";
import { StudioRail } from "@/components/workspace/StudioRail";
import { AddSourcesModal } from "@/components/workspace/AddSourcesModal";
import { QuizModal } from "@/components/workspace/QuizModal";

export default function NotebookWorkspace() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const notebookTitle = decodeURIComponent(id || "Untitled notebook");

  const [modal, setModal] = useState<"sources" | "quiz" | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"sources" | "studio" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const createNotebook = () => {
    navigate("/");
  };

  return (
    <div className="flex h-[100dvh] min-h-[540px] flex-col overflow-hidden bg-[#202226] text-[#eef0f4]">
      <TopBar mode="notebook" notebookTitle={notebookTitle} onCreate={createNotebook} onToast={showToast} />
      <div className="flex min-h-0 flex-1 flex-col bg-[#202226]">
        <div className="flex items-center gap-2 border-b border-[#30343b] bg-[#202226] px-4 py-2 xl:hidden">
          <button onClick={() => setMobilePanel("sources")} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#2c3037] py-2 text-xs text-[#dce0e7]">
            <PanelLeft size={14} /> Sources
          </button>
          <button onClick={() => setMobilePanel("studio")} className="flex flex-1 items-center justify-center gap-2 rounded-full bg-[#2c3037] py-2 text-xs text-[#dce0e7]">
            <PanelRight size={14} /> Studio
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          {/* Sources Rail */}
          <div className={`${mobilePanel === "sources" ? "fixed inset-0 z-40 flex" : "hidden"} xl:flex`}>
            <div className="absolute inset-0 bg-black/60 lg:hidden" onClick={() => setMobilePanel(null)} />
            <div className="relative flex w-[88vw] max-w-[330px] flex-col xl:w-auto xl:max-w-none">
              <div className="absolute right-3 top-3 z-10 lg:hidden">
                <IconButton label="Close sources" onClick={() => setMobilePanel(null)}><X size={18} /></IconButton>
              </div>
              <SourcesRail onAdd={() => setModal("sources")} onToast={showToast} />
            </div>
          </div>

          {/* Chat Canvas */}
          <ChatCanvas notebookTitle={notebookTitle} sourceCount={8} onToast={showToast} />

          {/* Studio Rail */}
          <div className={`${mobilePanel === "studio" ? "fixed inset-0 z-40 flex justify-end" : "hidden"} xl:flex`}>
            <div className="absolute inset-0 bg-black/60 lg:hidden" onClick={() => setMobilePanel(null)} />
            <div className="relative flex w-[88vw] max-w-[350px] flex-col xl:w-auto xl:max-w-none">
              <div className="absolute left-3 top-3 z-10 lg:hidden">
                <IconButton label="Close Studio" onClick={() => setMobilePanel(null)}><X size={18} /></IconButton>
              </div>
              <StudioRail onQuiz={() => setModal("quiz")} onToast={showToast} onAddNote={() => showToast("Note added to this notebook")} />
            </div>
          </div>
        </div>
      </div>
      {modal === "sources" && <AddSourcesModal onClose={() => setModal(null)} onToast={showToast} />}
      {modal === "quiz" && <QuizModal onClose={() => setModal(null)} onToast={showToast} />}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}