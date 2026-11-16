'use client';

import { useActionState, useEffect } from 'react';

import {
  Checkbox,
  Field,
  FieldGrid,
  FormMessage,
  Input,
  Textarea,
} from '@/components/ui/form';
import { Callout } from '@/components/ui/page';
import { SubmitButton } from '@/components/ui/submit-button';
import { createPlan, updatePlan } from '@/lib/actions/plans';
import type { ActionState } from '@/lib/actions/subscriptions';

/**
 * Edit a plan (`planId` given) or create one (no `planId`). A new plan also
 * asks for its permanent key.
 */
export function PlanForm({
  planId,
  displayName = '',
  description = null,
  priceMonthly = 0,
  priceYearly = 0,
  trialDays = null,
  maxContacts = 0,
  maxMessagesMonthly = 0,
  maxBroadcastsMonthly = 0,
  maxFlows = null,
  maxTeamMembers = 1,
  maxStorageMb = 0,
  isActive = true,
  activeSubscribers = 0,
  currencyCode,
  onSaved,
}: {
  planId?: string;
  displayName?: string;
  description?: string | null;
  priceMonthly?: number;
  priceYearly?: number;
  trialDays?: number | null;
  maxContacts?: number;
  maxMessagesMonthly?: number;
  maxBroadcastsMonthly?: number;
  maxFlows?: number | null;
  maxTeamMembers?: number;
  maxStorageMb?: number;
  isActive?: boolean;
  activeSubscribers?: number;
  currencyCode: string;
  /** Called after a successful save; a modal uses it to close. */
  onSaved?: () => void;
}) {
  const creating = !planId;
  const [state, formAction] = useActionState<ActionState, FormData>(
    creating ? createPlan : updatePlan,
    {}
  );
  useEffect(() => {
    if (state.ok) onSaved?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-5">
      {planId ? <input type="hidden" name="planId" value={planId} /> : null}

      {activeSubscribers > 0 ? (
        <Callout tone="warn">
          <strong className="font-semibold">
            {activeSubscribers} active subscription
            {activeSubscribers === 1 ? '' : 's'} on this plan.
          </strong>{' '}
          A price change applies to all of them at once — and because the plan
          table is the only record of price, it also changes every historical
          figure in this panel. It does not change anything at Stripe or
          Razorpay.
        </Callout>
      ) : null}

      <FieldGrid>
        {creating ? (
          <Field
            label="Plan key"
            hint="Permanent id, e.g. scale. Lowercase letters, numbers, - and _."
          >
            <Input
              name="name"
              required
              maxLength={40}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
        ) : null}
        <Field label="Display name">
          <Input name="displayName" defaultValue={displayName} required />
        </Field>

        <Field
          label={`Monthly price (${currencyCode})`}
          hint="0 makes the plan free."
        >
          <Input
            type="number"
            name="priceMonthly"
            defaultValue={priceMonthly}
            min={0}
            step="0.01"
            required
          />
        </Field>

        <Field
          label={`Yearly price (${currencyCode})`}
          hint="The full annual charge, not the monthly share."
        >
          <Input
            type="number"
            name="priceYearly"
            defaultValue={priceYearly}
            min={0}
            step="0.01"
            required
          />
        </Field>

        <Field label="Trial days" hint="Empty for no trial.">
          <Input
            type="number"
            name="trialDays"
            defaultValue={trialDays ?? ''}
            min={0}
            max={365}
          />
        </Field>
      </FieldGrid>

      <Field label="Description">
        <Textarea
          name="description"
          defaultValue={description ?? ''}
          rows={2}
        />
      </Field>

      <div>
        <p className="text-ink-2 mb-3 text-xs font-semibold">
          Limits the CRM enforces
        </p>
        <FieldGrid>
          <Field label="Contacts" hint="0 means no contacts allowed.">
            <Input
              type="number"
              name="maxContacts"
              defaultValue={maxContacts}
              min={0}
              required
            />
          </Field>
          <Field label="Messages per month">
            <Input
              type="number"
              name="maxMessagesMonthly"
              defaultValue={maxMessagesMonthly}
              min={0}
              required
            />
          </Field>
          <Field label="Broadcasts per month">
            <Input
              type="number"
              name="maxBroadcastsMonthly"
              defaultValue={maxBroadcastsMonthly}
              min={0}
              required
            />
          </Field>
          <Field label="Flows" hint="Empty means unlimited.">
            <Input
              type="number"
              name="maxFlows"
              defaultValue={maxFlows ?? ''}
              min={0}
            />
          </Field>
          <Field label="Team members">
            <Input
              type="number"
              name="maxTeamMembers"
              defaultValue={maxTeamMembers}
              min={0}
              required
            />
          </Field>
          <Field label="Storage (MB)">
            <Input
              type="number"
              name="maxStorageMb"
              defaultValue={maxStorageMb}
              min={0}
              required
            />
          </Field>
        </FieldGrid>
      </div>

      <Checkbox
        name="isActive"
        label="Offered to new subscribers"
        defaultChecked={isActive}
        hint="Turning this off hides the plan from signup. Existing subscribers stay on it and keep being billed."
      />

      <FormMessage ok={state.ok} error={state.error} />

      <SubmitButton pendingLabel="Saving…">
        {creating ? 'Create plan' : 'Save plan'}
      </SubmitButton>
    </form>
  );
}
