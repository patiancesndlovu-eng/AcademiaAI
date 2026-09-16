import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { MoreVertical, Grid2X2, LayoutGrid, Plus, Copy, BarChart3, Share2, Settings, HelpCircle, Zap, Globe2, Check } from "lucide-react";
import { IconButton, PillButton, AcademiaMark, BellIcon, MARK_URL } from "@/components/common/Primitives";
import { Popover, PopoverItem } from "@/components/common/Popover";
import { InsightsModal, ShareModal, SettingsModal, HelpModal, ShortcutsModal } from "@/components/layout/TopBarDialogs";

type Dialog = "insights" | "share" | "settings" | "help" | "shortcuts" | null;

const LANGUAGES = ["English", "Español", "Português"];
const LANGUAGE_STORAGE_KEY = "academiaai:output-language";

interface TopBarProps {
  mode: "dashboard" | "notebook";
  notebookTitle?: string;
  onCreate: () => void;
  onToast: (message: string) => void;
  notebook?: any;
  sources?: any[];
  onNotebookUpdated?: (notebook: any) => void;
  onNotebookDeleted?: () => void;
}

export function TopBar({ mode, notebookTitle, onCreate, onToast, notebook, sources = [], onNotebookUpdated, onNotebookDeleted }: TopBarProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [copied, setCopied] = useState(false);
  const [language, setLanguage] = useState<string>(() => localStorage.getItem(LANGUAGE_STORAGE_KEY) || "English");
  const navigate = useNavigate();
  const moreRef = useRef<HTMLButtonElement>(null);
  const appMenuRef = useRef<HTMLButtonElement>(null);

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

  const chooseLanguage = (lang: string) => {
    setLanguage(lang);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    setLangOpen(false);
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
          <PillButton onClick={() => setDialog("insights")}><BarChart3 size={15} /> Insights</PillButton>
          <PillButton onClick={() => setDialog("share")}><Share2 size={15} /> Share</PillButton>
          <PillButton onClick={() => setDialog("settings")}><Settings size={15} /> Settings</PillButton>
        </div>
      )}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {mode === "dashboard" && <PillButton filled onClick={onCreate}><Plus size={15} /> <span className="hidden sm:inline">Create notebook</span></PillButton>}
        <div className="relative">
          <IconButton ref={moreRef} label="More options" active={menuOpen} onClick={() => setMenuOpen((v) => !v)}><MoreVertical size={19} /></IconButton>
          <Popover open={menuOpen} onClose={() => setMenuOpen(false)} anchorRef={moreRef} align="right" className="w-56">
            <PopoverItem icon={<HelpCircle size={16} />} onClick={() => { setMenuOpen(false); setDialog("help"); }}>AcademiaAi help</PopoverItem>
            <PopoverItem icon={<Zap size={16} />} onClick={() => { setMenuOpen(false); setDialog("shortcuts"); }}>Keyboard shortcuts</PopoverItem>
            <PopoverItem icon={<Globe2 size={16} />} onClick={() => { setMenuOpen(false); setLangOpen(true); }}>Output language — {language}</PopoverItem>
            <PopoverItem icon={<BellIcon />} onClick={() => { setMenuOpen(false); setNotifOpen(true); }}>Notifications</PopoverItem>
          </Popover>
          <Popover open={langOpen} onClose={() => setLangOpen(false)} anchorRef={moreRef} align="right" className="w-48">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#858c98]">Output language</div>
            {LANGUAGES.map((lang) => (
              <PopoverItem key={lang} active={language === lang} onClick={() => chooseLanguage(lang)}>{lang}</PopoverItem>
            ))}
          </Popover>
          <Popover open={notifOpen} onClose={() => setNotifOpen(false)} anchorRef={moreRef} align="right" className="w-60">
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#858c98]">Notifications</div>
            <p className="px-3 pb-2 pt-1 text-[12px] leading-5 text-[#9ba2ae]">You&apos;re all caught up. Activity on your notebooks will appear here.</p>
          </Popover>
        </div>
        <div className="relative">
          <IconButton ref={appMenuRef} label="App menu" active={appMenuOpen} onClick={() => setAppMenuOpen((v) => !v)}><Grid2X2 size={19} /></IconButton>
          <Popover open={appMenuOpen} onClose={() => setAppMenuOpen(false)} anchorRef={appMenuRef} align="right" className="w-48">
            <PopoverItem icon={<LayoutGrid size={16} />} onClick={() => { setAppMenuOpen(false); navigate("/"); }}>Dashboard</PopoverItem>
            <PopoverItem icon={<Plus size={16} />} onClick={() => { setAppMenuOpen(false); onCreate(); }}>New notebook</PopoverItem>
          </Popover>
        </div>
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

      {dialog === "insights" && notebook && (
        <InsightsModal notebook={notebook} sources={sources} onClose={() => setDialog(null)} />
      )}
      {dialog === "share" && notebook && onNotebookUpdated && (
        <ShareModal notebook={notebook} onClose={() => setDialog(null)} onToast={onToast} onNotebookUpdated={onNotebookUpdated} />
      )}
      {dialog === "settings" && notebook && onNotebookUpdated && onNotebookDeleted && (
        <SettingsModal notebook={notebook} onClose={() => setDialog(null)} onToast={onToast} onNotebookUpdated={onNotebookUpdated} onNotebookDeleted={onNotebookDeleted} />
      )}
      {dialog === "help" && <HelpModal onClose={() => setDialog(null)} />}
      {dialog === "shortcuts" && <ShortcutsModal onClose={() => setDialog(null)} />}
    </header>
  );
}
