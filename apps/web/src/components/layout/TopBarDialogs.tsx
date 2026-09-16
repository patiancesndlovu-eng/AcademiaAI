import { useEffect, useMemo, useState } from "react";
import { Check, Link2, Loader2, Trash2, UserPlus, X } from "lucide-react";
import { ModalShell } from "@/components/workspace/ModalShell";
import { updateNotebook, deleteNotebook, addMember, removeMember } from "@/lib/api";

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ---------- Insights: real stats computed from the notebook's sources ---------- */

export function InsightsModal({ notebook, sources, onClose }: { notebook: any; sources: any[]; onClose: () => void }) {
  const stats = useMemo(() => {
    const byType = new Map<string, number>();
    sources.forEach((s) => byType.set(s.type, (byType.get(s.type) || 0) + 1));
    const latest = sources.reduce<any>(
      (acc, s) => (!acc || new Date(s.createdAt || 0) > new Date(acc.createdAt || 0) ? s : acc),
      null
    );
    return {
      total: sources.length,
      selectedCount: sources.filter((s) => s.selected).length,
      byType: Array.from(byType.entries()).sort((a, b) => b[1] - a[1]),
      latest,
    };
  }, [sources]);

  return (
    <ModalShell title="Insights" onClose={onClose}>
      <div className="mx-auto max-w-[520px]">
        <h3 className="font-display text-[22px] tracking-[-0.03em] text-[#f0f2f6]">{notebook.title}</h3>
        <p className="mt-1 text-[13px] text-[#9ba2ae]">Updated {formatDate(notebook.updatedAt)}</p>

        {stats.total === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-[#565c68] bg-[#25282d] px-6 py-10 text-center">
            <p className="text-sm text-[#9fa6b3]">Add sources to this notebook to see insights about your evidence base.</p>
          </div>
        ) : (
          <>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[#3b3f48] bg-[#25282d] p-4">
                <p className="font-display text-[28px] tracking-[-0.03em] text-[#f0f2f6]">{stats.total}</p>
                <p className="mt-1 text-[12px] text-[#9ba2ae]">Sources in this notebook</p>
              </div>
              <div className="rounded-2xl border border-[#3b3f48] bg-[#25282d] p-4">
                <p className="font-display text-[28px] tracking-[-0.03em] text-[#f0f2f6]">{stats.selectedCount}</p>
                <p className="mt-1 text-[12px] text-[#9ba2ae]">Currently selected for chat and Studio</p>
              </div>
            </div>

            <div className="mt-6">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#858c98]">Sources by type</p>
              <div className="space-y-3">
                {stats.byType.map(([type, count]) => (
                  <div key={type}>
                    <div className="mb-1 flex items-center justify-between text-[12px] text-[#c8ccd4]">
                      <span className="capitalize">{type}</span>
                      <span className="text-[#8f96a3]">{count}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#30343b]">
                      <div className="h-full rounded-full bg-[#6f8ff0]" style={{ width: `${Math.round((count / stats.total) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {stats.latest && (
              <div className="mt-6 rounded-2xl border border-[#3b3f48] bg-[#25282d] p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#858c98]">Most recently added</p>
                <p className="mt-1.5 truncate text-[13px] text-[#e4e7ec]">{stats.latest.title}</p>
                <p className="mt-0.5 text-[11px] text-[#8f96a3]">{stats.latest.domain || stats.latest.type} · {formatDate(stats.latest.createdAt)}</p>
              </div>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}

/* ---------- Share: copyable link + visibility persisted through the API ---------- */

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Private", description: "Only you can open this notebook." },
  { value: "shared", label: "Shared", description: "Only invited collaborators can open it." },
  { value: "public", label: "Public", description: "Anyone with the link can view it." },
];

export function ShareModal({ notebook, onClose, onToast, onNotebookUpdated }: { notebook: any; onClose: () => void; onToast: (message: string) => void; onNotebookUpdated: (notebook: any) => void }) {
  const [copied, setCopied] = useState(false);
  const [visibility, setVisibility] = useState<string>(notebook.visibility ?? "private");
  const [saving, setSaving] = useState(false);
  const [members, setMembers] = useState<any[]>(notebook.members ?? []);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [inviting, setInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const isOwner = notebook.myRole === "owner";

  useEffect(() => {
    setVisibility(notebook.visibility ?? "private");
    setMembers(notebook.members ?? []);
  }, [notebook.visibility, notebook.members]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      onToast("Notebook link copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      onToast("Failed to copy link");
    }
  };

  const invite = async () => {
    if (!email.trim() || inviting) return;
    setInviting(true);
    try {
      const member = await addMember(notebook.id, { email: email.trim(), role });
      setMembers((prev) => [...prev, member]);
      setEmail("");
      onToast("Collaborator invited");
    } catch (e: any) {
      onToast(e?.message || "Failed to invite collaborator");
    } finally {
      setInviting(false);
    }
  };

  const changeVisibility = async (next: string) => {
    if (next === visibility || saving) return;
    setVisibility(next);
    setSaving(true);
    try {
      const updated = await updateNotebook(notebook.id, { visibility: next });
      onNotebookUpdated(updated);
      onToast("Sharing settings updated");
    } catch (e: any) {
      setVisibility(notebook.visibility ?? "private");
      onToast(e?.message || "Failed to update sharing settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Share" onClose={onClose}>
      <div className="mx-auto max-w-[520px]">
        <h3 className="font-display text-[22px] tracking-[-0.03em] text-[#f0f2f6]">Share this notebook</h3>
        <p className="mt-2 text-sm leading-6 text-[#9ba2ae]">Copy the link to share this notebook, and choose who can open it.</p>

        <div className="mt-5 flex items-center gap-2 rounded-xl border border-[#4b515c] bg-[#15171a] px-4 py-3">
          <Link2 size={15} className="shrink-0 text-[#858c98]" />
          <input readOnly value={window.location.href} onFocus={(event) => event.target.select()} aria-label="Notebook link" className="w-full min-w-0 bg-transparent text-[13px] text-[#c8ccd4] outline-none" />
          <button onClick={copyLink} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#6f8ff0] px-3.5 py-1.5 text-[12px] font-semibold text-[#141b2d] transition hover:bg-[#92abff] active:scale-[0.98]">
            {copied ? <Check size={13} /> : <Link2 size={13} />} {copied ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="mt-6">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#858c98]">Who can open it</p>
          <div className="space-y-2">
            {VISIBILITY_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => changeVisibility(option.value)}
                disabled={saving}
                className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${visibility === option.value ? "border-[#6f8ff0] bg-[#28304a]" : "border-[#3b3f48] bg-[#25282d] hover:border-[#5a6070]"}`}
              >
                <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${visibility === option.value ? "border-[#8baeff] bg-[#6f91e9] text-[#202226]" : "border-[#656b78] text-transparent"}`}>
                  <Check size={12} strokeWidth={3} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium text-[#e4e7ec]">{option.label}</span>
                  <span className="mt-0.5 block text-[12px] text-[#9ba2ae]">{option.description}</span>
                </span>
                {saving && visibility === option.value && <Loader2 size={14} className="shrink-0 animate-spin text-[#9ebaff]" />}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-5 text-[#8f96a3]">Only the notebook owner can change sharing.</p>
        </div>

        <div className="mt-6">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#858c98]">Collaborators</p>
          {members.length === 0 ? (
            <p className="text-[12px] text-[#9ba2ae]">No collaborators yet.</p>
          ) : (
            <div className="space-y-2">
              {members.map((m: any) => (
                <div key={m.id} className="flex items-center gap-3 rounded-xl border border-[#3b3f48] bg-[#25282d] px-3.5 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-[#e4e7ec]">{m.user?.displayName || m.user?.email || m.userId}</span>
                    <span className="block text-[11px] capitalize text-[#8f96a3]">{m.role}</span>
                  </span>
                  {isOwner && m.role !== "owner" && (
                    <button
                      onClick={async () => {
                        setRemovingId(m.userId);
                        try {
                          await removeMember(notebook.id, m.userId);
                          setMembers((prev) => prev.filter((x) => x.userId !== m.userId));
                          onToast("Collaborator removed");
                        } catch (e: any) {
                          onToast(e?.message || "Failed to remove collaborator");
                        } finally {
                          setRemovingId(null);
                        }
                      }}
                      disabled={removingId === m.userId}
                      aria-label={`Remove ${m.user?.email || m.userId}`}
                      title="Remove collaborator"
                      className="rounded-full p-1.5 text-[#7e8693] transition hover:bg-[#2c3037] hover:text-white disabled:opacity-40"
                    >
                      {removingId === m.userId ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {isOwner ? (
            <div className="mt-3 flex gap-2">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void invite(); }}
                type="email"
                placeholder="teammate@example.com"
                aria-label="Collaborator email"
                className="h-11 min-w-0 flex-1 rounded-xl border border-[#4b515c] bg-[#15171a] px-4 text-sm text-[#eef0f4] outline-none transition placeholder:text-[#7e8794] focus:border-[#6b8eef] focus:ring-2 focus:ring-[#5f75b1]/40"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "viewer" | "editor")}
                aria-label="Collaborator role"
                className="h-11 shrink-0 rounded-xl border border-[#4b515c] bg-[#15171a] px-3 text-sm text-[#eef0f4] outline-none focus:border-[#6b8eef]"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button
                disabled={!email.trim() || inviting}
                onClick={() => void invite()}
                className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-[#6f8ff0] px-4 text-[13px] font-semibold text-[#141b2d] transition hover:bg-[#92abff] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {inviting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />} Invite
              </button>
            </div>
          ) : (
            <p className="mt-3 text-[11px] leading-5 text-[#8f96a3]">Only the notebook owner can invite collaborators.</p>
          )}
        </div>
      </div>
    </ModalShell>
  );
}

/* ---------- Settings: rename/describe via PATCH, delete via DELETE ---------- */

export function SettingsModal({ notebook, onClose, onToast, onNotebookUpdated, onNotebookDeleted }: {
  notebook: any;
  onClose: () => void;
  onToast: (message: string) => void;
  onNotebookUpdated: (notebook: any) => void;
  onNotebookDeleted: () => void;
}) {
  const [title, setTitle] = useState(notebook.title ?? "");
  const [description, setDescription] = useState(notebook.description ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setTitle(notebook.title ?? "");
    setDescription(notebook.description ?? "");
    setConfirmDelete(false);
  }, [notebook]);

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const updated = await updateNotebook(notebook.id, { title: title.trim(), description: description.trim() });
      onNotebookUpdated(updated);
      onToast("Notebook updated");
      onClose();
    } catch (e: any) {
      onToast(e?.message || "Failed to update notebook");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await deleteNotebook(notebook.id);
      onNotebookDeleted();
    } catch (e: any) {
      setDeleting(false);
      setConfirmDelete(false);
      onToast(e?.message || "Failed to delete notebook");
    }
  };

  return (
    <ModalShell title="Notebook settings" onClose={onClose}>
      <div className="mx-auto max-w-[520px]">
        <label className="block text-[13px] font-semibold text-[#d7dae1]">Title</label>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-2 w-full rounded-xl border border-[#4b515c] bg-[#15171a] px-4 py-3 text-sm text-[#eef0f4] outline-none transition focus:border-[#6b8eef] focus:ring-2 focus:ring-[#5f75b1]/40"
        />
        <label className="mt-5 block text-[13px] font-semibold text-[#d7dae1]">Description</label>
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          placeholder="What is this notebook trying to answer?"
          className="mt-2 w-full resize-none rounded-xl border border-[#4b515c] bg-[#15171a] px-4 py-3 text-sm leading-6 text-[#eef0f4] outline-none transition placeholder:text-[#7e8794] focus:border-[#6b8eef] focus:ring-2 focus:ring-[#5f75b1]/40"
        />

        <div className="mt-8 flex items-center justify-end gap-3 border-t border-[#30343b] pt-5">
          <button onClick={onClose} className="rounded-full px-4 py-2.5 text-[13px] font-medium text-[#b4bbc7] transition hover:bg-[#2c3037] hover:text-white">Cancel</button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="inline-flex items-center gap-2 rounded-full bg-[#6f8ff0] px-5 py-2.5 text-[13px] font-semibold text-[#141b2d] transition hover:bg-[#92abff] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving && <Loader2 size={15} className="animate-spin" />}
            Save changes
          </button>
        </div>

        <div className="mt-8 rounded-2xl border border-[#5c3a3a] bg-[#2d2426] p-4">
          <p className="text-[13px] font-semibold text-[#e8b9b9]">Delete this notebook</p>
          <p className="mt-1 text-[12px] leading-5 text-[#a98f91]">The notebook and its sources are removed for everyone. This cannot be undone.</p>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className={`mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 ${confirmDelete ? "bg-[#d9534f] text-white hover:bg-[#e06a66]" : "border border-[#7a4a4a] text-[#e8b9b9] hover:bg-[#3a2c2e]"}`}
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {deleting ? "Deleting…" : confirmDelete ? "Click again to confirm" : "Delete notebook"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ---------- Help & Keyboard shortcuts ---------- */

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="AcademiaAi help" onClose={onClose}>
      <div className="mx-auto max-w-[520px]">
        <h3 className="font-display text-[22px] tracking-[-0.03em] text-[#f0f2f6]">How this workspace fits together</h3>
        <ol className="mt-5 space-y-4 text-[14px] leading-6 text-[#c8ccd4]">
          <li><strong className="font-semibold text-[#eef0f4]">1. Create a notebook</strong> from the dashboard and give it a working question or topic.</li>
          <li><strong className="font-semibold text-[#eef0f4]">2. Add sources</strong> — paste a URL, drop a file, or paste text. Everything stays attached to the notebook.</li>
          <li><strong className="font-semibold text-[#eef0f4]">3. Select the sources</strong> you want to work with; the chat and Studio outputs use your selection.</li>
          <li><strong className="font-semibold text-[#eef0f4]">4. Generate in Studio</strong> — quizzes, reports, notes, and other study outputs are saved to the Studio panel.</li>
        </ol>
      </div>
    </ModalShell>
  );
}

const SHORTCUTS = [
  { keys: "Enter", description: "Send the chat message" },
  { keys: "Shift + Enter", description: "Add a new line in the chat composer" },
  { keys: "Esc", description: "Close dialogs, menus, and mobile panels" },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  return (
    <ModalShell title="Keyboard shortcuts" onClose={onClose}>
      <div className="mx-auto max-w-[480px]">
        <div className="space-y-2.5">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center justify-between rounded-xl border border-[#3b3f48] bg-[#25282d] px-4 py-3">
              <span className="text-[13px] text-[#c8ccd4]">{shortcut.description}</span>
              <kbd className="rounded-lg border border-[#4c515c] bg-[#15171a] px-2.5 py-1 font-mono text-[12px] text-[#e4e7ec]">{shortcut.keys}</kbd>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}
