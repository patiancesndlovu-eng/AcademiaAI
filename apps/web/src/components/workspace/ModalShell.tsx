import type { ReactNode } from "react";
import { X, Sparkles } from "lucide-react";

interface ModalShellProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  size?: "standard" | "wide";
}

export function ModalShell({ title, onClose, children, size = "standard" }: ModalShellProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0f12]/75 p-4 backdrop-blur-[3px] animate-fade-in" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-[20px] border border-[#3e434e] bg-[#202327] shadow-[0_28px_90px_rgba(0,0,0,.55)] animate-modal-in ${size === "wide" ? "max-w-[820px]" : "max-w-[900px]"}`}>
        <div className="flex items-center justify-between border-b border-[#343841] px-5 py-4 sm:px-7">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#30384e] text-[#a6bdff]">
              <Sparkles size={16} />
            </span>
            <h2 className="font-display text-[18px] text-[#f0f2f6]">{title}</h2>
          </div>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full bg-[#373b43] text-[#d6d9df] transition hover:bg-[#4a4f59] hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="p-5 sm:p-7">{children}</div>
      </div>
    </div>
  );
}