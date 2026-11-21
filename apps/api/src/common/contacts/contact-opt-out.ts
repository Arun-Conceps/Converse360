import type { PrismaService } from '../../prisma/prisma.service';

/**
 * Marketing opt-out.
 *
 * `contacts.opted_out_at` (migration 102) is what broadcasts consult. Replies
 * in the inbox deliberately ignore it: somebody who texted STOP and then writes
 * in with a question is still owed an answer.
 */

export type OptKeyword = 'opt_out' | 'opt_in';

// EXACT match on the whole message, never "contains". "please stop sending the
// wrong size" is a support request, not an opt-out, and silently dropping that
// customer from every future campaign is the worse error. CANCEL and END are
// left out for the same reason (they are about orders and subscriptions).
const OPT_OUT = new Set(['stop', 'stopall', 'unsubscribe', 'quit', 'optout']);
const OPT_IN = new Set(['start', 'unstop', 'subscribe', 'optin', 'yes start']);

/** Lowercases, strips everything but letters and single spaces. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function classifyOptKeyword(
  text: string | null | undefined,
): OptKeyword | null {
  if (!text) return null;
  const n = normalise(text);
  if (!n) return null;
  // "opt out" / "stop all" arrive with a space; compare both spellings.
  const joined = n.replace(/ /g, '');
  if (OPT_OUT.has(n) || OPT_OUT.has(joined)) return 'opt_out';
  if (OPT_IN.has(n) || OPT_IN.has(joined)) return 'opt_in';
  return null;
}

/**
 * Applies a keyword to a contact of THIS account. `updateMany` with the
 * account in the filter, so a contact id from anywhere else matches nothing.
 */
export async function applyOptKeyword(
  prisma: Pick<PrismaService, 'contacts'>,
  accountId: string,
  contactId: string,
  kind: OptKeyword,
): Promise<boolean> {
  const data =
    kind === 'opt_out'
      ? { opted_out_at: new Date(), opt_out_source: 'keyword' }
      : { opted_out_at: null, opt_out_source: null };
  const where =
    kind === 'opt_out'
      ? { id: contactId, account_id: accountId, opted_out_at: null }
      : { id: contactId, account_id: accountId, opted_out_at: { not: null } };
  const { count } = await prisma.contacts.updateMany({ where, data });
  return count > 0;
}

const CHUNK = 5000;

/** Ids, among `contactIds`, that have opted out of marketing. */
export async function optedOutIds(
  prisma: Pick<PrismaService, 'contacts'>,
  accountId: string,
  contactIds: string[],
): Promise<Set<string>> {
  const out = new Set<string>();
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const rows = await prisma.contacts.findMany({
      where: {
        account_id: accountId,
        id: { in: contactIds.slice(i, i + CHUNK) },
        opted_out_at: { not: null },
      },
      select: { id: true },
    });
    for (const r of rows) out.add(r.id);
  }
  return out;
}

/** Drops opted-out contacts from a broadcast audience. */
export async function excludeOptedOut<T extends { id: string }>(
  prisma: Pick<PrismaService, 'contacts'>,
  accountId: string,
  contacts: T[],
): Promise<T[]> {
  if (contacts.length === 0) return contacts;
  const out = await optedOutIds(
    prisma,
    accountId,
    contacts.map((c) => c.id),
  );
  return out.size === 0 ? contacts : contacts.filter((c) => !out.has(c.id));
}
