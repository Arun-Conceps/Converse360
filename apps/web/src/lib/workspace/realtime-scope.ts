/**
 * Pure decisions for "should this realtime row be accepted for workspace X?".
 *
 * Realtime follows RLS, and RLS follows MEMBERSHIPS, so a user in workspaces
 * A and B receives B's rows while looking at A. See scope.ts for the rule.
 *
 * `conversations`, `contacts` and `notifications` carry `account_id` and are
 * filtered server-side. `messages` has NO `account_id` column, so it cannot be
 * filtered at the channel: it must be resolved through its conversation.
 */

/** Realtime filter string for an account-scoped table. */
export function accountRealtimeFilter(accountId: string): string {
  return `account_id=eq.${accountId}`;
}

/**
 * A row with an `account_id` belongs to the workspace only if it matches.
 * Strict on purpose: a row that does not say which workspace it is in is not
 * shown in this one.
 */
export function rowBelongsToWorkspace(
  // `object`: row types (e.g. Conversation) may not declare account_id even
  // though the database row, and so the realtime payload, carries it.
  row: object | null | undefined,
  accountId: string | null | undefined,
): boolean {
  if (!accountId || !row) return false;
  return (row as { account_id?: string | null }).account_id === accountId;
}

/**
 * Per-workspace memory of which conversation ids are ours / not ours, so a
 * message event costs at most one lookup per conversation, not one per message.
 * `lookup` must itself filter by account_id (or return it for comparison).
 */
export function createConversationScopeCache(
  accountId: string,
  lookup: (
    conversationId: string,
  ) => Promise<{ account_id?: string | null } | null>,
) {
  const verdicts = new Map<string, boolean>();
  const inflight = new Map<string, Promise<boolean>>();

  return {
    accountId,
    /** Record a conversation already known to be in this workspace. */
    markOwn(id: string) {
      verdicts.set(id, true);
    },
    async isOwn(conversationId: string | null | undefined): Promise<boolean> {
      if (!conversationId) return false;
      const known = verdicts.get(conversationId);
      if (known !== undefined) return known;
      const pending = inflight.get(conversationId);
      if (pending) return pending;
      const p = (async () => {
        try {
          const row = await lookup(conversationId);
          const own = rowBelongsToWorkspace(row, accountId);
          verdicts.set(conversationId, own);
          return own;
        } catch {
          // Do not cache a failure; and never alert/prepend on unknown.
          return false;
        } finally {
          inflight.delete(conversationId);
        }
      })();
      inflight.set(conversationId, p);
      return p;
    },
  };
}
