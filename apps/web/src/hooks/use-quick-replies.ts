'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  bumpQuickReplyUse,
  listQuickReplies,
} from '@/lib/quick-replies/data';
import type { QuickReply } from '@/lib/quick-replies/match';

/**
 * The active workspace's quick replies.
 *
 * Takes `accountId` and does nothing until it is known: filtering on null
 * returns an empty list that is indistinguishable from an empty workspace
 * (see lib/workspace/scope.ts), so the fetch simply does not run.
 *
 * Load failure leaves the list empty rather than throwing. A composer that
 * cannot reach this table is still a working composer, and "/" opening an
 * empty list is a better failure than an agent unable to type.
 */
export function useQuickReplies(accountId: string | null | undefined) {
  const [replies, setReplies] = useState<QuickReply[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      setReplies(await listQuickReplies(accountId));
    } catch {
      setReplies([]);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Count a use locally at once, and in the database without waiting. */
  const recordUse = useCallback(
    (reply: QuickReply) => {
      if (!accountId) return;
      setReplies((prev) =>
        prev.map((r) =>
          r.id === reply.id ? { ...r, use_count: r.use_count + 1 } : r
        )
      );
      void bumpQuickReplyUse(accountId, reply.id, reply.use_count);
    },
    [accountId]
  );

  return { replies, loading, reload, recordUse };
}
