'use client';

/**
 * The media library — one grid of a workspace's files, used as a picker
 * from four places (flow media node, inbox composer, template/broadcast
 * media, and its own page) and as a manager from the page.
 *
 * ⚠️ ONE COMPONENT, TWO MODES, DELIBERATELY.
 *   `onPick` present = picker (clicking a tile chooses it and closes).
 *   `onPick` absent = manager (clicking selects for delete/rename).
 *   The alternative — a separate "manage" screen — is how the two drift
 *   until the page shows files the picker cannot see.
 *
 * ⚠️ UPLOAD IS ALWAYS AVAILABLE, INCLUDING FROM THE PICKER.
 *   The first thing anyone does at a picker is realise the file isn't
 *   there yet. A picker that can only pick sends them to another screen
 *   and loses their place in the form they were filling in.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Folder,
  FolderInput,
  FolderPlus,
  FileText,
  Loader2,
  Pencil,
  Music,
  Search,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import {
  LIBRARY_SOFT_QUOTA_BYTES,
  createFolder,
  deleteAsset,
  deleteFolder,
  formatBytes,
  listFolders,
  listLibrary,
  moveAssets,
  renameFolder,
  touchAsset,
  uploadToLibrary,
  type MediaAsset,
  type MediaFolder,
  type MediaKind,
} from '@/lib/media/library';

const TABS: { id: MediaKind; label: string }[] = [
  { id: 'image', label: 'Image' },
  { id: 'audio', label: 'Audio' },
  { id: 'video', label: 'Video' },
  { id: 'file', label: 'File' },
];

export interface MediaLibraryProps {
  /**
   * Picker mode. Called with the chosen asset; the host closes itself.
   * Omit for manager mode.
   */
  onPick?: (asset: MediaAsset) => void;
  /**
   * Restrict the picker to one kind — a flow's image node has no use
   * for a spreadsheet. Tabs outside the filter are hidden rather than
   * disabled: a tab you may not click is just a dead control.
   */
  accept?: MediaKind[];
  /** Manager mode fills its container; picker mode sits in a dialog. */
  className?: string;
}

export function MediaLibrary({ onPick, accept, className }: MediaLibraryProps) {
  const { accountId } = useAuth();
  const tabs = useMemo(
    () => (accept?.length ? TABS.filter((t) => accept.includes(t.id)) : TABS),
    [accept]
  );
  const [tab, setTab] = useState<MediaKind>(tabs[0]?.id ?? 'image');
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  // Folders (migration 104). `null` = "All files". A file is in at most one
  // folder, and also always appears under All files.
  const [folders, setFolders] = useState<MediaFolder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderEdit, setFolderEdit] = useState<{
    mode: 'create' | 'rename';
    value: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    try {
      const [list, folderList] = await Promise.all([
        listLibrary(accountId),
        // Folders are an extra: a failure here (e.g. migration 104 not yet
        // applied) must not take the whole library down with it.
        listFolders(accountId).catch(() => [] as MediaFolder[]),
      ]);
      setAssets(list);
      setFolders(folderList);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't load your media."
      );
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The meter counts EVERYTHING, not the current tab — "how much am I
  // storing" is a question about the workspace.
  const totalBytes = useMemo(
    () => assets.reduce((sum, a) => sum + (a.size_bytes || 0), 0),
    [assets]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter(
      (a) =>
        a.kind === tab &&
        (folderId === null || a.folder_id === folderId) &&
        (!q || a.filename.toLowerCase().includes(q))
    );
  }, [assets, tab, query, folderId]);

  const activeFolder = folders.find((f) => f.id === folderId) ?? null;
  const folderCount = useCallback(
    (id: string) => assets.filter((a) => a.folder_id === id).length,
    [assets]
  );

  const recent = useMemo(
    () =>
      visible
        .filter((a) => a.last_used_at)
        .sort((a, b) =>
          (b.last_used_at ?? '').localeCompare(a.last_used_at ?? '')
        )
        .slice(0, 6),
    [visible]
  );

  const countFor = useCallback(
    (kind: MediaKind) =>
      assets.filter(
        (a) => a.kind === kind && (folderId === null || a.folder_id === folderId)
      ).length,
    [assets, folderId]
  );

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    if (!accountId) {
      toast.error('No workspace selected.');
      return;
    }
    setUploading(true);
    let failed = 0;
    for (const file of Array.from(files)) {
      try {
        const asset = await uploadToLibrary(accountId, file, folderId);
        setAssets((prev) => [asset, ...prev]);
        // Land the user on the tab their file went to, so an upload is
        // never invisible because they were looking at "Audio".
        setTab(asset.kind);
      } catch (err) {
        failed += 1;
        toast.error(err instanceof Error ? err.message : 'Upload failed.');
      }
    }
    setUploading(false);
    const ok = files.length - failed;
    if (ok > 0) toast.success(`Uploaded ${ok} file${ok === 1 ? '' : 's'}.`);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function handleDelete() {
    const targets = assets.filter((a) => selected.includes(a.id));
    if (targets.length === 0) return;
    const ok = window.confirm(
      targets.length === 1
        ? `Delete "${targets[0].filename}"? Anything already using it will show a broken file.`
        : `Delete ${targets.length} files? Anything already using them will show a broken file.`
    );
    if (!ok) return;

    for (const asset of targets) {
      try {
        await deleteAsset(asset);
        setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : `Couldn't delete ${asset.filename}.`
        );
      }
    }
    setSelected([]);
  }

  async function submitFolder() {
    if (!accountId || !folderEdit) return;
    try {
      if (folderEdit.mode === 'create') {
        const f = await createFolder(accountId, folderEdit.value);
        setFolders((prev) =>
          [...prev, f].sort((a, b) => a.name.localeCompare(b.name))
        );
        setFolderId(f.id);
      } else if (activeFolder) {
        await renameFolder(accountId, activeFolder.id, folderEdit.value);
        const name = folderEdit.value.trim();
        setFolders((prev) =>
          prev
            .map((f) => (f.id === activeFolder.id ? { ...f, name } : f))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
      }
      setFolderEdit(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Folder not saved.');
    }
  }

  async function handleDeleteFolder() {
    if (!accountId || !activeFolder) return;
    const n = folderCount(activeFolder.id);
    const ok = window.confirm(
      `Delete the folder "${activeFolder.name}"? ${
        n > 0
          ? `Its ${n} file${n === 1 ? '' : 's'} will stay in All files.`
          : 'It is empty.'
      }`
    );
    if (!ok) return;
    try {
      await deleteFolder(accountId, activeFolder.id);
      setFolders((prev) => prev.filter((f) => f.id !== activeFolder.id));
      setAssets((prev) =>
        prev.map((a) =>
          a.folder_id === activeFolder.id ? { ...a, folder_id: null } : a
        )
      );
      setFolderId(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't delete the folder."
      );
    }
  }

  async function handleMove(target: string) {
    if (!accountId || selected.length === 0) return;
    const dest = target === '' ? null : target;
    try {
      await moveAssets(accountId, selected, dest);
      setAssets((prev) =>
        prev.map((a) =>
          selected.includes(a.id) ? { ...a, folder_id: dest } : a
        )
      );
      toast.success(
        dest
          ? `Moved to "${folders.find((f) => f.id === dest)?.name ?? 'folder'}".`
          : 'Removed from its folder.'
      );
      setSelected([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't move files.");
    }
  }

  function choose(asset: MediaAsset) {
    if (onPick) {
      touchAsset(asset.id);
      onPick(asset);
      return;
    }
    setSelected((prev) =>
      prev.includes(asset.id)
        ? prev.filter((id) => id !== asset.id)
        : [...prev, asset.id]
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      {/* ---- toolbar: search · upload · delete · meter ---- */}
      <div className="flex flex-wrap items-center gap-2 px-1 pb-3">
        <div className="relative min-w-[180px] flex-1">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search media"
            aria-label="Search media"
            className="bg-muted h-9 pl-8"
          />
        </div>

        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => void handleFiles(e.target.files)}
        />
        <Button
          size="sm"
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          Upload
        </Button>

        {!onPick && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleDelete()}
            disabled={selected.length === 0}
            className={cn(selected.length > 0 && 'text-accent-red')}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
            {selected.length > 0 ? ` (${selected.length})` : ''}
          </Button>
        )}

        {!onPick && selected.length > 0 && (
          <label className="flex items-center gap-1.5">
            <FolderInput className="text-muted-foreground h-3.5 w-3.5" />
            <select
              aria-label="Move selected files to folder"
              value="__none__"
              onChange={(e) => void handleMove(e.target.value)}
              className="border-border bg-muted text-foreground h-8 rounded-md border px-2 text-xs"
            >
              <option value="__none__" disabled>
                Move to…
              </option>
              <option value="">No folder</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <span className="text-muted-foreground ml-auto text-xs">
          {formatBytes(totalBytes)} used of{' '}
          {formatBytes(LIBRARY_SOFT_QUOTA_BYTES)}
        </span>
      </div>

      {/* ---- folders ---- */}
      <div
        aria-label="Folders"
        className="flex flex-wrap items-center gap-1.5 px-1 pb-3"
      >
        <FolderChip
          active={folderId === null}
          onClick={() => setFolderId(null)}
          label={`All files (${assets.length})`}
        />
        {folders.map((f) => (
          <FolderChip
            key={f.id}
            active={folderId === f.id}
            onClick={() => setFolderId(f.id)}
            label={`${f.name} (${folderCount(f.id)})`}
            icon
          />
        ))}
        {folderEdit ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void submitFolder();
            }}
          >
            <Input
              autoFocus
              value={folderEdit.value}
              maxLength={60}
              onChange={(e) =>
                setFolderEdit({ ...folderEdit, value: e.target.value })
              }
              onKeyDown={(e) => e.key === 'Escape' && setFolderEdit(null)}
              placeholder="Folder name"
              aria-label="Folder name"
              className="bg-muted h-7 w-40 text-xs"
            />
            <Button type="submit" size="sm" className="h-7 px-2">
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => setFolderEdit(null)}
              aria-label="Cancel"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setFolderEdit({ mode: 'create', value: '' })}
              className="text-muted-foreground hover:text-foreground border-border flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-xs"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              New folder
            </button>
            {activeFolder && !onPick && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    setFolderEdit({ mode: 'rename', value: activeFolder.name })
                  }
                  aria-label={`Rename ${activeFolder.name}`}
                  className="text-muted-foreground hover:text-foreground p-1"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteFolder()}
                  aria-label={`Delete folder ${activeFolder.name}`}
                  className="text-muted-foreground hover:text-accent-red p-1"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </>
        )}
      </div>

      {/* ---- kind tabs ---- */}
      <div
        role="tablist"
        aria-label="Media type"
        className="border-border flex items-center gap-1 border-b px-1"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
              tab === t.id
                ? 'border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground border-transparent'
            )}
          >
            {t.label} ({countFor(t.id)})
          </button>
        ))}
      </div>

      {/* ---- grid ---- */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1 py-4">
        {loading ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading your media…
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            query={query}
            onUpload={() => fileInput.current?.click()}
          />
        ) : (
          <>
            {recent.length > 0 && !query && folderId === null && (
              <section className="mb-6">
                <h3 className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wider uppercase">
                  Recently used ({recent.length})
                </h3>
                <AssetGrid
                  assets={recent}
                  selected={selected}
                  pickMode={Boolean(onPick)}
                  onChoose={choose}
                />
              </section>
            )}
            <section>
              <h3 className="text-muted-foreground mb-2 text-[11px] font-semibold tracking-wider uppercase">
                All {tab}s ({visible.length})
              </h3>
              <AssetGrid
                assets={visible}
                selected={selected}
                pickMode={Boolean(onPick)}
                onChoose={choose}
              />
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function AssetGrid({
  assets,
  selected,
  pickMode,
  onChoose,
}: {
  assets: MediaAsset[];
  selected: string[];
  pickMode: boolean;
  onChoose: (asset: MediaAsset) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3">
      {assets.map((asset) => (
        <button
          key={asset.id}
          type="button"
          onClick={() => onChoose(asset)}
          title={`${asset.filename} · ${formatBytes(asset.size_bytes)}`}
          className={cn(
            'group border-border bg-card flex flex-col overflow-hidden rounded-lg border text-left transition-colors',
            selected.includes(asset.id)
              ? 'border-primary ring-primary/30 ring-2'
              : 'hover:border-primary/50'
          )}
        >
          <span className="bg-muted flex aspect-square items-center justify-center overflow-hidden">
            {asset.kind === 'image' ? (
              // User media on a public Supabase bucket. next/image would
              // need every project host in `remotePatterns`, and these are
              // 112px thumbnails of files the user just uploaded — the
              // optimiser has nothing to win here.
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={asset.url}
                alt={asset.filename}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <KindGlyph kind={asset.kind} />
            )}
          </span>
          <span className="flex flex-col gap-0.5 px-2 py-1.5">
            <span className="text-foreground truncate text-[11.5px] font-medium">
              {asset.filename}
            </span>
            <span className="text-muted-foreground text-[10px]">
              {formatBytes(asset.size_bytes)}
            </span>
          </span>
          {pickMode && (
            <span className="bg-primary text-primary-foreground pointer-events-none absolute opacity-0 transition-opacity group-hover:opacity-100" />
          )}
        </button>
      ))}
    </div>
  );
}

function FolderChip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex max-w-[200px] items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary/30 bg-primary/10 text-primary'
          : 'border-border bg-muted text-muted-foreground hover:text-foreground'
      )}
    >
      {icon && <Folder className="h-3.5 w-3.5 shrink-0" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

function KindGlyph({ kind }: { kind: MediaKind }) {
  const Icon = kind === 'video' ? Video : kind === 'audio' ? Music : FileText;
  return <Icon className="text-muted-foreground h-7 w-7" />;
}

function EmptyState({
  query,
  onUpload,
}: {
  query: string;
  onUpload: () => void;
}) {
  if (query) {
    return (
      <p className="text-muted-foreground py-16 text-center text-sm">
        Nothing matches “{query}”.
      </p>
    );
  }
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <p className="text-foreground text-sm font-medium">Nothing here yet.</p>
      <p className="text-muted-foreground max-w-sm text-xs">
        Upload once and reuse it anywhere — flows, broadcasts, templates and the
        inbox all pick from this library.
      </p>
      <Button size="sm" variant="outline" onClick={onUpload}>
        <Upload className="h-3.5 w-3.5" />
        Upload a file
      </Button>
    </div>
  );
}

/**
 * The library in a modal. `Dialog` is not used here: this needs to be
 * mountable from inside the flow editor's `fixed inset-0` shell and from
 * a plain page, and a bare fixed overlay behaves identically in both.
 */
export function MediaLibraryDialog({
  open,
  onClose,
  onPick,
  accept,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (asset: MediaAsset) => void;
  accept?: MediaKind[];
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="bg-background/70 absolute inset-0 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="bg-card border-border relative flex h-[min(680px,90vh)] w-[min(900px,95vw)] flex-col rounded-xl border p-4 shadow-2xl">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-foreground text-base font-semibold">
            Media library
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close media library"
            className="text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-8 items-center justify-center rounded-md transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <MediaLibrary
          onPick={(asset) => {
            onPick(asset);
            onClose();
          }}
          accept={accept}
          className="flex-1"
        />
      </div>
    </div>
  );
}
