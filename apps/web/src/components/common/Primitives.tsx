import type { ReactNode } from "react";
import { BookOpen, NotebookPen, FileText, Globe2 } from "lucide-react";

export const MARK_URL = "/manus-storage/academiaai-mark_e370d65a.png";

export function IconButton({ label, children, onClick, active = false, className = "" }: { label: string; children: ReactNode; onClick?: () => void; active?: boolean; className?: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-[#aeb4bf] transition duration-150 hover:border-[#41454e] hover:bg-[#2b2e35] hover:text-white active:scale-[0.97] ${active ? "bg-[#30343d] text-white" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export function PillButton({ label, children, onClick, filled = false, className = "" }: { label?: string; children: ReactNode; onClick?: () => void; filled?: boolean; className?: string }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-[13px] font-medium transition duration-150 active:scale-[0.98] ${filled ? "border-[#e8ebf3] bg-[#f4f5f7] text-[#26282d] hover:bg-white" : "border-[#3b3f48] bg-[#23262b]/75 text-[#d6d9e0] hover:border-[#5a6070] hover:bg-[#2d3037]"} ${className}`}
    >
      {children}
    </button>
  );
}

export function AcademiaMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 ${compact ? "" : "min-w-fit"}`}>
      <img src={MARK_URL} alt="AcademiaAi" className={`${compact ? "h-8 w-8" : "h-9 w-9"} object-contain`} />
      {!compact && <span className="font-display text-[19px] font-medium tracking-[-0.04em] text-[#eef0f5]">AcademiaAi</span>}
    </div>
  );
}

export function SourceGlyph({ kind, color }: { kind: string; color: string }) {
  const icon = kind === "book" ? <BookOpen size={13} /> : kind === "guide" ? <NotebookPen size={13} /> : kind === "paper" ? <FileText size={13} /> : <Globe2 size={13} />;
  return <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#181a1d]" style={{ backgroundColor: color }}>{icon}</span>;
}

export function GoogleDriveMark() {
  return <svg aria-label="Google Drive" role="img" viewBox="0 0 48 48" className="h-4 w-4" fill="none"><path fill="#0F9D58" d="M18.1 6.2h11.8l12.6 21.6-5.9 10.2H24.8L18.1 26.5 11.5 37.9H5.6z"/><path fill="#4285F4" d="m18.1 6.2 6.7 11.5-6.7 11.5H4.7L11.5 17z"/><path fill="#F4B400" d="M24.8 29.2h11.8l5.9 10.2H30.7l-5.9-10.2Z"/></svg>;
}

export function YouTubeMark() {
  return <svg aria-label="YouTube" role="img" viewBox="0 0 24 24" className="h-4 w-4"><path fill="#FF0033" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8Z"/><path fill="#fff" d="m9.6 15.6 6.2-3.6-6.2-3.6v7.2Z"/></svg>;
}

export function BellIcon() {
  return <span className="relative flex h-4 w-4 items-center justify-center"><span className="h-3.5 w-3 rounded-t-full border border-current border-b-0" /><span className="absolute bottom-0 h-px w-4 bg-current" /></span>;
}