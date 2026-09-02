import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { MoreVertical, Grid2X2, Plus, Copy, BarChart3, Share2, Settings, HelpCircle, Zap, Globe2, Check } from "lucide-react";
import { IconButton, PillButton, AcademiaMark, BellIcon, MARK_URL } from "@/components/common/Primitives";

interface TopBarProps {
  mode: "dashboard" | "notebook";
  notebookTitle?: string;
  onCreate: () => void;
  onToast: (message: string) => void;
}

export function TopBar({ mode, notebookTitle, onCreate, onToast }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const navigate = useNavigate();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      onToast("Notebook link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast("Failed to copy link");
    }
  };

  return (
    <header className="flex h-[70px] shrink-0 items-center justify-between border-b border-[#30343b] bg-[#202226] px-4 sm:px-7">
      <div className="flex min-w-0 items-center gap-3">
        {mode === "notebook" ? (
          <button onClick={() => navigate("/")} className="flex items-center gap-3 rounded-full pr-2 text-left transition hover:bg-[#2b2e34] active:scale-[0.99]">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#f2f4f8]">
              <img src={MARK_URL} alt="AcademiaAi" className="h-7 w-7" />
            </span>
            <span className="hidden max-w-[180px] truncate font-display text-[17px] font-medium tracking-[-0.025em] text-[#edf0f4] sm:max-w-[390px] sm:block">{notebookTitle}</span>
          </button>
        ) : (
          <button onClick={() => navigate("/")} className="rounded-lg p-1.5 transition hover:bg-[#2b2e34]">
            <AcademiaMark />
          </button>
        )}
      </div>
      {mode === "notebook" && (
        <div className="hidden items-center gap-2 xl:flex">
          <PillButton filled onClick={onCreate}><Plus size={15} /> Create notebook</PillButton>
          <PillButton onClick={handleCopy}>{copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copied" : "Copy"}</PillButton>
          <PillButton onClick={() => onToast("Insights are being prepared for this notebook")}><BarChart3 size={15} /> Insights</PillButton>
          <PillButton onClick={() => onToast("Share settings opened")}><Share2 size={15} /> Share</PillButton>
          <PillButton onClick={() => onToast("Notebook settings opened")}><Settings size={15} /> Settings</PillButton>
        </div>
      )}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {mode === "dashboard" && <PillButton filled onClick={onCreate}><Plus size={15} /> <span className="hidden sm:inline">Create notebook</span></PillButton>}
        <div className="relative">
          <IconButton label="More options" active={menuOpen} onClick={() => setMenuOpen((v) => !v)}><MoreVertical size={19} /></IconButton>
          {menuOpen && (
            <div className="absolute right-0 top-11 z-40 w-52 overflow-hidden rounded-2xl border border-[#3a3f49] bg-[#292c32] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,.4)] animate-pop-in">
              {["AcademiaAi help", "Keyboard shortcuts", "Output language", "Notifications"].map((item, index) => (
                <button key={item} onClick={() => { setMenuOpen(false); onToast(`${item} opened`); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-[#d6d9df] transition hover:bg-[#373b44]">
                  {index === 0 ? <HelpCircle size={16} /> : index === 1 ? <Zap size={16} /> : index === 2 ? <Globe2 size={16} /> : <BellIcon />}
                  <span>{item}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* App menu: just a toast for now. If you want a global nav drawer later, wire it here. */}
        <IconButton label="App menu" onClick={() => onToast("App menu opened")}><Grid2X2 size={19} /></IconButton>
        <UserButton
          afterSignOutUrl="/sign-in"
          appearance={{
            elements: {
              avatarBox: "h-9 w-9 rounded-full ring-2 ring-[#3a3f49]",
              userButtonPopoverCard: "bg-[#292c32] border border-[#3a3f49]",
              userButtonPopoverActionButton: "text-[#d6d9df] hover:bg-[#373b44]",
              userButtonPopoverActionButtonText: "text-[#d6d9df]",
              userButtonPopoverFooter: "hidden",
            },
          }}
        />
      </div>
    </header>
  );
}