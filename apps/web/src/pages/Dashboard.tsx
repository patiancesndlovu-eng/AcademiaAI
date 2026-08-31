import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BookMarked, BookOpen, NotebookPen, Plus, Search, Grid2X2, List, ChevronDown, ChevronRight, ExternalLink, MoreVertical } from "lucide-react";
import { TopBar } from "@/components/layout/TopBar";
import { Toast } from "@/components/common/Toast";
import { CreateNotebookModal } from "@/components/dashboard/CreateNotebookModal";
import { IconButton } from "@/components/common/Primitives";

const COVER_ETHICS = "/manus-storage/academiaai-cover-ethics_9a7fb3c5.jpg";
const COVER_COGNITION = "/manus-storage/academiaai-cover-cognition_57109674.jpg";
const COVER_METHODS = "/manus-storage/academiaai-cover-methods_2e3232f9.jpg";

const featuredNotebooks = [
  { title: "Literature Review Lab", author: "AcademiaAi Library", meta: "18 sources · Curated", image: COVER_METHODS, tone: "from-black/80 via-black/25 to-black/10" },
  { title: "How to read a research paper", author: "Open Learning Studio", meta: "24 sources · Updated today", image: COVER_COGNITION, tone: "from-black/75 via-black/25 to-black/5" },
  { title: "Cognitive Science Field Notes", author: "Maya Chen", meta: "31 sources · 2 days ago", image: COVER_ETHICS, tone: "from-black/80 via-black/30 to-black/5" },
  { title: "Can a model explain a theorem?", author: "AcademiaAi Research", meta: "17 sources · Recommended", image: COVER_COGNITION, tone: "from-black/80 via-black/35 to-black/5" },
];

const recentNotebooks = [
  { title: "Thesis reading list", meta: "12 sources · 27 Aug 2026", icon: "search" as const, className: "bg-[#3b3142]" },
  { title: "Research methods & measurement", meta: "8 sources · 26 Aug 2026", icon: "book" as const, className: "bg-[#303542]" },
  { title: "Untitled notebook", meta: "0 sources · 22 Aug 2026", icon: "notes" as const, className: "bg-[#2c3039]" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("All");
  const [toast, setToast] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const tabs = ["All", "My notebooks", "Discover", "Collections"];

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2600);
  };

  const openNotebook = (title: string) => {
    navigate(`/notebook/${encodeURIComponent(title)}`);
  };

  const createNotebook = () => setCreateOpen(true);

  return (
    <div className="flex h-[100dvh] min-h-[540px] flex-col overflow-hidden bg-[#202226] text-[#eef0f4]">
      <TopBar mode="dashboard" onCreate={createNotebook} onToast={showToast} />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#202226]">
        <main className="mx-auto w-full max-w-[1390px] px-5 pb-14 pt-7 sm:px-8 lg:px-12">
          <div className="flex items-center justify-between gap-4">
            <nav className="flex items-center gap-1 overflow-x-auto pb-1 text-[14px] text-[#aeb3bd] [scrollbar-width:none]">
              {tabs.map((item) => (
                <button key={item} onClick={() => setTab(item)} className={`shrink-0 rounded-full px-4 py-2.5 transition ${tab === item ? "bg-[#363a46] text-[#eef0f7]" : "hover:bg-[#292c33] hover:text-white"}`}>
                  {item}
                </button>
              ))}
            </nav>
            <div className="hidden items-center gap-2 md:flex">
              <IconButton label="Search notebooks" onClick={() => showToast("Notebook search is ready") }><Search size={18} /></IconButton>
              <div className="flex items-center rounded-full border border-[#3d414a] bg-[#25282d] p-1">
                <IconButton label="Grid view" active><Grid2X2 size={16} /></IconButton>
                <IconButton label="List view" onClick={() => showToast("List view coming soon")}><List size={17} /></IconButton>
              </div>
              <button onClick={() => showToast("Sorting by most recent")} className="ml-2 flex items-center gap-2 rounded-full border border-[#3d414a] bg-[#25282d] px-4 py-2.5 text-[13px] text-[#d2d5dc] transition hover:border-[#5a6070]">
                <span>Most recent</span><ChevronDown size={15} />
              </button>
            </div>
          </div>

          <section className="mt-10">
            <div className="mb-5 flex items-end justify-between">
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#7ea7ff]">Your research desk</p>
                <h1 className="font-display text-[30px] font-medium tracking-[-0.045em] text-[#f0f2f6] sm:text-[38px]">Make sense of what you&rsquo;re reading.</h1>
              </div>
              <button onClick={() => showToast("Featured notebooks expanded")} className="hidden items-center gap-1.5 rounded-full border border-[#3b3f48] px-4 py-2.5 text-sm text-[#d1d5de] transition hover:bg-[#2b2e34] sm:flex">
                View all <ChevronRight size={15} />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {featuredNotebooks.map((notebook) => (
                <button key={notebook.title} onClick={() => openNotebook(notebook.title)} className="group relative min-h-[225px] overflow-hidden rounded-[18px] border border-[#3b3f47] bg-[#2b2e34] text-left shadow-[0_8px_24px_rgba(0,0,0,.16)] transition duration-200 hover:-translate-y-0.5 hover:border-[#61759f] hover:shadow-[0_16px_38px_rgba(0,0,0,.28)]">
                  <img src={notebook.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-75 transition duration-500 group-hover:scale-[1.04] group-hover:opacity-90" />
                  <div className={`absolute inset-0 bg-gradient-to-t ${notebook.tone}`} />
                  <div className="relative flex h-full min-h-[225px] flex-col justify-end p-5">
                    <div className="mb-auto flex items-center gap-2 pt-1 text-[12px] text-[#f4f4f4]">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-[#292c32]"><BookMarked size={13} /></span>
                      <span>{notebook.author}</span>
                    </div>
                    <h3 className="max-w-[250px] font-display text-[22px] leading-[1.08] tracking-[-0.035em] text-white">{notebook.title}</h3>
                    <div className="mt-3 flex items-center gap-2 text-[12px] text-[#e4e7ec]">
                      <span>{notebook.meta}</span>
                      <span className="h-1 w-1 rounded-full bg-[#d8dce2]" />
                      <ExternalLink size={13} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-12">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-[24px] tracking-[-0.035em] text-[#f0f2f6]">Recent notebooks</h2>
              <button onClick={() => showToast("Recent notebooks expanded")} className="text-sm text-[#9eabbf] transition hover:text-white">See all</button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <button onClick={createNotebook} className="group flex min-h-[194px] flex-col items-center justify-center rounded-[17px] border border-dashed border-[#565c68] bg-[#25282d] px-6 text-center transition hover:border-[#7ea7ff] hover:bg-[#2a2e38]">
                <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#303850] text-[#9dbbff] transition group-hover:scale-105">
                  <Plus size={28} strokeWidth={1.6} />
                </span>
                <span className="font-display text-[19px] tracking-[-0.03em] text-[#eff1f5]">Create new notebook</span>
                <span className="mt-2 text-[13px] text-[#9fa6b3]">Start with a question or a source</span>
              </button>
              {recentNotebooks.map((notebook) => (
                <button key={notebook.title} onClick={() => openNotebook(notebook.title)} className={`group relative flex min-h-[194px] flex-col justify-between overflow-hidden rounded-[17px] border border-[#3b3f48] ${notebook.className} p-5 text-left transition hover:-translate-y-0.5 hover:border-[#65708b]`}>
                  <div className="flex items-start justify-between">
                    <span className="flex h-12 w-12 items-center justify-center rounded-[15px] bg-[#7a4d9d]/70 text-[#efdfff] shadow-inner">
                      {notebook.icon === "search" ? <Search size={24} /> : notebook.icon === "book" ? <BookOpen size={24} /> : <NotebookPen size={24} />}
                    </span>
                    <MoreVertical size={19} className="text-[#adb2bd]" />
                  </div>
                  <div>
                    <h3 className="max-w-[225px] font-display text-[20px] leading-[1.12] tracking-[-0.035em] text-[#f1f2f5]">{notebook.title}</h3>
                    <p className="mt-3 text-[12px] text-[#adb3bf]">{notebook.meta}</p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </main>
      </div>
      {createOpen && (
        <CreateNotebookModal
          onClose={() => setCreateOpen(false)}
          onCreate={(title) => { setCreateOpen(false); openNotebook(title); showToast("Notebook created"); }}
        />
      )}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}