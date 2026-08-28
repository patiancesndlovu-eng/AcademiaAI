import type { ReactNode } from "react";
import { Search, ChevronDown, Sparkles, UploadCloud, Clipboard } from "lucide-react";
import { ModalShell } from "./ModalShell";
import { GoogleDriveMark, YouTubeMark } from "@/components/common/Primitives";

function ModalAction({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-2 rounded-full border border-[#414751] bg-[#292d34] px-3.5 py-2 text-xs font-medium text-[#e1e4ea] transition hover:border-[#7181a9] hover:bg-[#333843] active:scale-[0.98]">
      {icon}{label}
    </button>
  );
}

interface AddSourcesModalProps {
  onClose: () => void;
  onToast: (message: string) => void;
}

export function AddSourcesModal({ onClose, onToast }: AddSourcesModalProps) {
  return (
    <ModalShell title="Add sources" onClose={onClose} size="wide">
      <div className="mx-auto max-w-[720px]">
        <p className="text-center font-display text-[26px] tracking-[-0.04em] text-[#eff1f5]">Bring the evidence into view.</p>
        <div className="mt-6 rounded-2xl border border-[#5971c5] bg-[#17191d] p-3 ring-1 ring-[#445796]/30">
          <div className="flex items-center gap-2 text-sm text-[#cfd4dc]">
            <Search size={17} className="text-[#929aa8]" />
            <span>Search the web for new sources</span>
            <Search size={17} className="ml-auto text-[#9db5ff]" />
          </div>
          <div className="mt-3 flex gap-2">
            <button className="flex items-center gap-1.5 rounded-full bg-[#2b3039] px-3 py-2 text-xs text-[#e2e5eb]"><Globe2 size={14} /> Web <ChevronDown size={13} /></button>
            <button className="flex items-center gap-1.5 rounded-full bg-[#2b3039] px-3 py-2 text-xs text-[#e2e5eb]"><Sparkles size={14} className="text-[#a0b8ff]" /> Quick scan <ChevronDown size={13} /></button>
          </div>
        </div>
        <div className="mt-7 flex min-h-[210px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#535965] bg-[#1e2024] px-6 text-center">
          <UploadCloud size={28} className="text-[#9fa8b7]" />
          <h3 className="mt-4 font-display text-[20px] text-[#e7eaf0]">Or drop your files</h3>
          <p className="mt-1 text-sm text-[#939aa7]">pdfs, images, docs, audio, and more</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <ModalAction icon={<UploadCloud size={15} />} label="Upload files" onClick={() => onToast("File picker opened")} />
            <ModalAction icon={<YouTubeMark />} label="Websites" onClick={() => onToast("Website source input opened")} />
            <ModalAction icon={<GoogleDriveMark />} label="Drive" onClick={() => onToast("Drive connection is coming soon")} />
            <ModalAction icon={<Clipboard size={15} />} label="Copied text" onClick={() => onToast("Paste your copied text into the notebook")} />
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between text-xs text-[#8e96a2]">
          <span>Sources stay attached to this notebook.</span>
          <span>0 / 50</span>
        </div>
      </div>
    </ModalShell>
  );
}