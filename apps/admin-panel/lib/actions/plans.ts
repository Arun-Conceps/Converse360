'use server';

import { refresh } from 'next/cache';

import { recordAudit } from '@/lib/actions/audit';
import { authorizeAction } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  FieldError,
  boolean,
  decimal,
  integer,
  optionalText,
  text,
  uuid,
} from '@/lib/actions/parse';
import type { ActionState } from '@/lib/actions/subscriptions';

/** The fields a plan form submits, parsed and sanity-checked. */
function readPlanFields(formData: FormData) {
  const displayName = text(formData, 'displayName', 'Display name');
  const description = optionalText(formData, 'description');
  const priceMonthly = decimal(formData, 'priceMonthly', {
    label: 'Monthly price',
  });
  const priceYearly = decimal(formData, 'priceYearly', {
    label: 'Yearly price',
  });
  const trialDays = integer(formData, 'trialDays', {
    label: 'Trial days',
    min: 0,
    max: 365,
    optional: true,
  });
  const maxContacts = integer(formData, 'maxContacts', {
    label: 'Contact limit',
  })!;
  const maxMessagesMonthly = integer(formData, 'maxMessagesMonthly', {
    label: 'Monthly message limit',
  })!;
  const maxBroadcastsMonthly = integer(formData, 'maxBroadcastsMonthly', {
    label: 'Monthly broadcast limit',
  })!;
  const maxFlows = integer(formData, 'maxFlows', {
    label: 'Flow limit',
    optional: true,
  });
  const maxTeamMembers = integer(formData, 'maxTeamMembers', {
    label: 'Team member limit',
  })!;
  const maxStorageMb = integer(formData, 'maxStorageMb', {
    label: 'Storage limit',
  })!;
  const isActive = boolean(formData, 'isActive');

  // A yearly price above 12× monthly means the annual plan costs more than
  // paying month to month, which is never intended and is invisible until a
  // customer complains.
  if (priceMonthly > 0 && priceYearly > priceMonthly * 12) {
    throw new FieldError(
      `Yearly price (${priceYearly}) is more than 12× the monthly price ` +
        `(${priceMonthly * 12}). Fix one of them.`
    );
  }

  return {
    displayName,
    description,
    priceMonthly,
    priceYearly,
    trialDays,
    maxContacts,
    maxMessagesMonthly,
    maxBroadcastsMonthly,
    maxFlows,
    maxTeamMembers,
    maxStorageMb,
    isActive,
  };
}

/** JSON-safe copy of plan fields for the audit detail (Decimals become strings). */
function planSnapshot(
  fields: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      value !== null && typeof value === 'object' ? String(value) : value,
    ])
  );
}

/** Add a plan. `name` is its permanent key: lowercase, unique, never edited. */
export async function createPlan(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const auth = await authorizeAction('billing.manage');
  if (auth.error) return { error: auth.error };
  const staff = auth.staff;

  try {
    const name = text(formData, 'name', 'Plan key')
      .toLowerCase()
      .replace(/\s+/g, '_');
    if (!/^[a-z][a-z0-9_-]{1,39}$/.test(name)) {
      throw new FieldError(
        'Plan key: 2-40 characters, starting with a letter; letters, numbers, - and _ only.'
      );
    }
    const f = readPlanFields(formData);

    const taken = await prisma.subscription_plans.findUnique({
      where: { name },
      select: { id: true },
    });
    if (taken) {
      throw new FieldError(
        'A plan with the key "' + name + '" already exists.'
      );
    }

    const created = await prisma.subscription_plans.create({
      data: {
        name,
        display_name: f.displayName,
        description: f.description,
        price_monthly: f.priceMonthly,
        price_yearly: f.priceYearly,
        trial_days: f.trialDays,
        max_contacts: f.maxContacts,
        max_messages_monthly: f.maxMessagesMonthly,
        max_broadcasts_monthly: f.maxBroadcastsMonthly,
        max_flows: f.maxFlows,
        max_team_members: f.maxTeamMembers,
        max_storage_mb: f.maxStorageMb,
        is_active: f.isActive,
      },
    });

    await recordAudit({
      actor: staff.actor,
      action: 'plan.create',
      targetType: 'plan',
      targetId: created.id,
      summary: `Created plan ${name} (${f.displayName}).`,
      detail: { after: planSnapshot({ name, ...f }) },
    });

    refresh();
    return {
      ok:
        'Created ' +
        f.displayName +
        '.' +
        (f.isActive
          ? ''
          : ' It is hidden from new signups until you turn it on.'),
    };
  } catch (error) {
    if (error instanceof FieldError) return { error: error.message };
    console.error('[admin-panel] plan create failed', error);
    return { error: 'Could not create the plan. Check the logs.' };
  }
}

/**
 * Plan writes — where the subscription amounts are actually set.
 *
 * A price change here takes effect for every subscriber on the plan the moment
 * it is saved, including their next renewal, and it rewrites every derived
 * revenue figure in the panel (there is no price history to fall back on). The
 * form warns about that; this file just makes sure the numbers are sane.
 *
 * Gateway ids (`stripe_price_id_*`, `razorpay_plan_id`) are intentionally not
 * editable here: changing a price in this table does not change it at Stripe or
 * Razorpay, and letting someone repoint a plan at a different gateway price
 * from an admin form is how subscribers end up charged an amount nobody chose.
 */
export async function updatePlan(
  _previous: ActionState,
  formData: FormData
): Promise<ActionState> {
  const auth = await authorizeAction('billing.manage');
  if (auth.error) return { error: auth.error };
  const staff = auth.staff;

  try {
    const planId = uuid(formData, 'planId', 'Plan');
    const {
      displayName,
      description,
      priceMonthly,
      priceYearly,
      trialDays,
      maxContacts,
      maxMessagesMonthly,
      maxBroadcastsMonthly,
      maxFlows,
      maxTeamMembers,
      maxStorageMb,
      isActive,
    } = readPlanFields(formData);

    const plan = await prisma.subscription_plans.findUnique({
      where: { id: planId },
      select: {
        name: true,
        display_name: true,
        description: true,
        price_monthly: true,
        price_yearly: true,
        trial_days: true,
        max_contacts: true,
        max_messages_monthly: true,
        max_broadcasts_monthly: true,
        max_flows: true,
        max_team_members: true,
        max_storage_mb: true,
        is_active: true,
        _count: { select: { user_subscriptions: true } },
      },
    });
    if (!plan) throw new FieldError('That plan no longer exists.');

    await prisma.subscription_plans.update({
      where: { id: planId },
      data: {
        display_name: displayName,
        description,
        price_monthly: priceMonthly,
        price_yearly: priceYearly,
        trial_days: trialDays,
        max_contacts: maxContacts,
        max_messages_monthly: maxMessagesMonthly,
        max_broadcasts_monthly: maxBroadcastsMonthly,
        max_flows: maxFlows,
        max_team_members: maxTeamMembers,
        max_storage_mb: maxStorageMb,
        is_active: isActive,
        updated_at: new Date(),
      },
    });

    await recordAudit({
      actor: staff.actor,
      action: 'plan.update',
      targetType: 'plan',
      targetId: planId,
      summary: `Updated plan ${plan.name}: monthly ${priceMonthly}, yearly ${priceYearly}, ${plan._count.user_subscriptions} subscription(s) affected.`,
      detail: {
        before: planSnapshot({
          displayName: plan.display_name,
          description: plan.description,
          priceMonthly: plan.price_monthly,
          priceYearly: plan.price_yearly,
          trialDays: plan.trial_days,
          maxContacts: plan.max_contacts,
          maxMessagesMonthly: plan.max_messages_monthly,
          maxBroadcastsMonthly: plan.max_broadcasts_monthly,
          maxFlows: plan.max_flows,
          maxTeamMembers: plan.max_team_members,
          maxStorageMb: plan.max_storage_mb,
          isActive: plan.is_active,
        }),
        after: planSnapshot({
          displayName,
          description,
          priceMonthly,
          priceYearly,
          trialDays,
          maxContacts,
          maxMessagesMonthly,
          maxBroadcastsMonthly,
          maxFlows,
          maxTeamMembers,
          maxStorageMb,
          isActive,
        }),
        affectedSubscriptions: plan._count.user_subscriptions,
      },
    });

    refresh();

    const affected = plan._count.user_subscriptions;
    const note = isActive
      ? ''
      : ' Hidden from new signups — existing subscribers stay on it.';

    return {
      ok:
        affected > 0
          ? `Saved ${plan.name}. ${affected} subscription${affected === 1 ? '' : 's'} now priced at the new amount.${note}`
          : `Saved ${plan.name}.${note}`,
    };
  } catch (error) {
    if (error instanceof FieldError) return { error: error.message };
    console.error('[admin-panel] plan write failed', error);
    return { error: 'Could not save the plan. Check the logs.' };
  }
}
