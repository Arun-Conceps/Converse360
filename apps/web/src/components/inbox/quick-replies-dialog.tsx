"use client";

import { useState } from "react";
import { Loader2, Pencil, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/hooks/use-auth";
import {
  createQuickReply,
  deleteQuickReply,
  QuickReplyError,
  updateQuickReply,
} from "@/lib/quick-replies/data";
import {
  BODY_MAX,
  SHORTCUT_MAX,
  normaliseShortcut,
  type QuickReply,
} from "@/lib/quick-replies/match";

interface QuickRepliesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replies: QuickReply[];
  /** Called after any create, edit or delete so the composer's list refreshes. */
  onChanged: () => void;
  /** Viewers can read the list but not change it. */
  canEdit: boolean;
}

/**
 * Create, edit and delete the workspace's quick replies.
 *
 * Opened from the composer's "/" list rather than living in Settings: the
 * moment an agent notices a reply is missing is the moment they are typing
 * one, and a trip to another screen to add it is a trip they will not make.
 */
export function QuickRepliesDialog({
  open,
  onOpenChange,
  replies,
  onChanged,
  canEdit,
}: QuickRepliesDialogProps) {
  const { user, accountId } = useAuth();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [shortcut, setShortcut] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setEditingId(null);
    setShortcut("");
    setBody("");
    setError(null);
  };

  const startEdit = (r: QuickReply) => {
    setEditingId(r.id);
    setShortcut(r.shortcut);
    setBody(r.body);
    setError(null);
  };

  const handleSave = async () => {
    if (!accountId || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await updateQuickReply(accountId, editingId, { shortcut, body });
        toast.success("Quick reply updated");
      } else {
        await createQuickReply(accountId, user?.id ?? null, { shortcut, body });
        toast.success("Quick reply saved");
      }
      reset();
      onChanged();
    } catch (e) {
      // Duplicate and invalid are the agent's to fix, so they show beside the
      // form; anything else is a genuine failure and gets a toast too.
      const message = e instanceof Error ? e.message : "Could not save";
      setError(message);
      if (!(e instanceof QuickReplyError) || e.kind === "failed") {
        toast.error(message);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (r: QuickReply) => {
    if (!accountId) return;
    try {
      await deleteQuickReply(accountId, r.id);
      if (editingId === r.id) reset();
      toast.success(`Deleted /${r.shortcut}`);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Quick replies
          </DialogTitle>
          <DialogDescription>
            Type <b>/</b> in a chat to insert one. Use {"{{name}}"},{" "}
            {"{{first_name}}"} or {"{{phone}}"} to fill in the customer.
          </DialogDescription>
        </DialogHeader>

        {canEdit && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <div className="space-y-1">
              <Label htmlFor="qr-shortcut">
                {editingId ? "Edit shortcut" : "Shortcut"}
              </Label>
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-sm">/</span>
                <Input
                  id="qr-shortcut"
                  value={shortcut}
                  maxLength={SHORTCUT_MAX}
                  placeholder="pricing"
                  onChange={(e) => setShortcut(normaliseShortcut(e.target.value))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="qr-body">Message</Label>
              <Textarea
                id="qr-body"
                value={body}
                maxLength={BODY_MAX}
                rows={3}
                placeholder="Hi {{first_name}}, our plans start at ..."
                onChange={(e) => setBody(e.target.value)}
              />
              <p className="text-muted-foreground text-right text-[11px]">
                {body.length}/{BODY_MAX}
              </p>
            </div>
            {error && (
              <p role="alert" className="text-destructive text-xs">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              {editingId && (
                <Button variant="ghost" size="sm" onClick={reset} disabled={saving}>
                  Cancel
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || !shortcut || !body.trim()}
              >
                {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                {editingId ? "Save changes" : "Add quick reply"}
              </Button>
            </div>
          </div>
        )}

        <div className="max-h-64 space-y-1 overflow-y-auto">
          {replies.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No quick replies yet.
              {canEdit ? " Add your first above." : ""}
            </p>
          ) : (
            replies.map((r) => (
              <div
                key={r.id}
                className="border-border flex items-start gap-2 rounded-md border px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">/{r.shortcut}</p>
                  <p className="text-muted-foreground line-clamp-2 text-xs">
                    {r.body}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Edit /${r.shortcut}`}
                      onClick={() => startEdit(r)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete /${r.shortcut}`}
                      onClick={() => handleDelete(r)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
