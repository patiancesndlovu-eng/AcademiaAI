import type { ReactNode } from "react";
import { useState, useRef } from "react";
import { UploadCloud, Link2, FileText, Loader2 } from "lucide-react";
import { ModalShell } from "./ModalShell";
import { addUrlSource, addTextSource, createUploadIntent, completeUpload, getClerkToken, API_BASE } from "@/lib/api";

function ModalAction({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick} className="inline-flex items-center gap-2 rounded-full border border-[#414751] bg-[#292d34] px-3.5 py-2 text-xs font-medium text-[#e1e4ea] transition hover:border-[#7181a9] hover:bg-[#333843] active:scale-[0.98] disabled:opacity-40">
      {icon}{label}
    </button>
  );
}

interface AddSourcesModalProps {
  notebookId: string;
  onClose: () => void;
  onSourcesAdded: (sources: any[]) => void;
  onToast: (message: string) => void;
  initialMode?: "url" | "text" | null;
}

export function AddSourcesModal({ notebookId, onClose, onSourcesAdded, onToast, initialMode = null }: AddSourcesModalProps) {
  const [mode, setMode] = useState<'url' | 'text' | 'upload' | null>(initialMode);
  const [url, setUrl] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textBody, setTextBody] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddUrl = async () => {
    if (!url.trim() || loading) return;
    setLoading(true);
    try {
      const source = await addUrlSource(notebookId, { url: url.trim() });
      onSourcesAdded([source]);
      onToast("Source added from URL");
    } catch (e: any) {
      onToast(e.message || "Failed to add URL source");
    } finally {
      setLoading(false);
    }
  };

  const handleAddText = async () => {
    if (!textTitle.trim() || !textBody.trim() || loading) return;
    setLoading(true);
    try {
      const source = await addTextSource(notebookId, { title: textTitle.trim(), text: textBody.trim() });
      onSourcesAdded([source]);
      onToast("Text source added");
    } catch (e: any) {
      onToast(e.message || "Failed to add text source");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (loading) return;
    setLoading(true);
    try {
      const intent = await createUploadIntent(notebookId, {
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size,
      });

      const uploadUrl = intent.uploadUrl.startsWith('http')
        ? intent.uploadUrl
        : `${API_BASE.replace('/api/v1', '')}${intent.uploadUrl}`;

      const token = await getClerkToken();
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!uploadRes.ok) throw new Error('Upload failed');

      const source = await completeUpload(notebookId, {
        filePath: intent.filePath,
        originalName: file.name,
      });

      onSourcesAdded([source]);
      onToast("File uploaded successfully");
    } catch (e: any) {
      onToast(e.message || "Failed to upload file");
    } finally {
      setLoading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files?.[0]) handleFileUpload(e.dataTransfer.files[0]);
  };

  return (
    <ModalShell title="Add sources" onClose={onClose} size="wide">
      <div className="mx-auto max-w-[720px]">
        <p className="text-center font-display text-[22px] tracking-[-0.04em] text-[#eff1f5] sm:text-[26px]">Bring the evidence into view.</p>

        {!mode && (
          <>
            <div className="mt-7 flex min-h-[210px] flex-col items-center justify-center rounded-2xl border border-dashed bg-[#1e2024] px-6 text-center transition"
              onDrop={onDrop}
            >
              <UploadCloud size={28} className="text-[#9fa8b7]" />
              <h3 className="mt-4 font-display text-[18px] text-[#e7eaf0] sm:text-[20px]">Drop your files here</h3>
              <p className="mt-1 text-sm text-[#939aa7]">PDFs, images, text files, and more</p>
              <input ref={fileInputRef} type="file" className="hidden" onChange={onFileChange} accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx" />
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                <ModalAction icon={<UploadCloud size={15} />} label="Upload files" onClick={() => fileInputRef.current?.click()} disabled={loading} />
                <ModalAction icon={<Link2 size={15} />} label="Add URL" onClick={() => setMode('url')} disabled={loading} />
                <ModalAction icon={<FileText size={15} />} label="Paste text" onClick={() => setMode('text')} disabled={loading} />
              </div>
            </div>
          </>
        )}

        {mode === 'url' && (
          <div className="mt-6 space-y-4">
            <button onClick={() => setMode(null)} className="text-xs text-[#9fa8b7] transition hover:text-white">← Back</button>
            <div className="rounded-2xl border border-[#3b3f48] bg-[#1e2024] p-4">
              <label className="block text-[13px] font-semibold text-[#d7dae1]">Source URL</label>
              <input
                autoFocus
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddUrl(); }}
                placeholder="https://example.com/article"
                className="mt-2 w-full rounded-xl border border-[#4b515c] bg-[#15171a] px-4 py-3 text-sm text-[#eef0f4] outline-none transition placeholder:text-[#7e8794] focus:border-[#6b8eef] focus:ring-2 focus:ring-[#5f75b1]/40"
              />
              <div className="mt-4 flex justify-end gap-3">
                <button onClick={() => setMode(null)} className="rounded-full px-4 py-2.5 text-[13px] text-[#b4bbc7] transition hover:bg-[#2c3037]">Cancel</button>
                <button disabled={!url.trim() || loading} onClick={handleAddUrl} className="inline-flex items-center gap-2 rounded-full bg-[#6f8ff0] px-5 py-2.5 text-[13px] font-semibold text-[#141b2d] disabled:opacity-40">
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Link2 size={15} />} Add URL
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === 'text' && (
          <div className="mt-6 space-y-4">
            <button onClick={() => setMode(null)} className="text-xs text-[#9fa8b7] transition hover:text-white">← Back</button>
            <div className="rounded-2xl border border-[#3b3f48] bg-[#1e2024] p-4">
              <label className="block text-[13px] font-semibold text-[#d7dae1]">Title</label>
              <input
                autoFocus
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                placeholder="e.g. Key findings from lecture notes"
                className="mt-2 w-full rounded-xl border border-[#4b515c] bg-[#15171a] px-4 py-3 text-sm text-[#eef0f4] outline-none transition placeholder:text-[#7e8794] focus:border-[#6b8eef] focus:ring-2 focus:ring-[#5f75b1]/40"
              />
              <label className="mt-4 block text-[13px] font-semibold text-[#d7dae1]">Text content</label>
              <textarea
                value={textBody}
                onChange={(e) => setTextBody(e.target.value)}
                rows={6}
                placeholder="Paste your notes, quotes, or excerpts here..."
                className="mt-2 w-full rounded-xl border border-[#4b515c] bg-[#15171a] px-4 py-3 text-sm text-[#eef0f4] outline-none transition placeholder:text-[#7e8794] focus:border-[#6b8eef] focus:ring-2 focus:ring-[#5f75b1]/40"
              />
              <div className="mt-4 flex justify-end gap-3">
                <button onClick={() => setMode(null)} className="rounded-full px-4 py-2.5 text-[13px] text-[#b4bbc7] transition hover:bg-[#2c3037]">Cancel</button>
                <button disabled={!textTitle.trim() || !textBody.trim() || loading} onClick={handleAddText} className="inline-flex items-center gap-2 rounded-full bg-[#6f8ff0] px-5 py-2.5 text-[13px] font-semibold text-[#141b2d] disabled:opacity-40">
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />} Add text
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between text-xs text-[#8e96a2]">
          <span>Sources stay attached to this notebook.</span>
        </div>
      </div>
    </ModalShell>
  );
}