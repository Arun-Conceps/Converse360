import { Check, Infinity as InfinityIcon } from 'lucide-react';
import type { Metadata } from 'next';

import { NewPlanButton } from '@/components/plans/new-plan-button';
import { PlanForm } from '@/components/plans/plan-form';
import { PlanModal } from '@/components/plans/plan-modal';
import { Pill } from '@/components/ui/badge';
import { DerivedNote } from '@/components/ui/card';
import { ButtonLink, Callout, PageHeader } from '@/components/ui/page';
import { StatRow, StatTile } from '@/components/ui/stat';
import { can, requireCapability } from '@/lib/auth';
import { currency } from '@/lib/env';
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { listPlans, type PlanRow } from '@/lib/queries/plans';

export const metadata: Metadata = {
  title: 'Plans & Pricing · Converse360 Control Center',
};

/** The limits a plan enforces, in the order a buyer reads them. */
function limitsOf(plan: PlanRow): { label: string; value: number | null }[] {
  return [
    { label: 'Contacts', value: plan.maxContacts },
    { label: 'Messages / month', value: plan.maxMessagesMonthly },
    { label: 'Broadcasts / month', value: plan.maxBroadcastsMonthly },
    { label: 'Flows', value: plan.maxFlows },
    { label: 'Team members', value: plan.maxTeamMembers },
    { label: 'Storage (MB)', value: plan.maxStorageMb },
  ];
}

export default async function PlansPage() {
  const staff = await requireCapability('billing.read');
  const canEdit = can(staff, 'billing.manage');
  const plans = await listPlans();
  const currencyCode = currency();

  const totalMrr = plans.reduce((sum, plan) => sum + plan.mrr, 0);
  const totalActive = plans.reduce((sum, plan) => sum + plan.active, 0);
  const offered = plans.filter((plan) => plan.isActive).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Revenue"
        title="Plans & Pricing"
        description="The subscription amounts themselves. Everything else in the Control Center is priced from here, and the pricing page and welcome wizard read this table live — an edit needs no deploy."
        actions={
          canEdit ? <NewPlanButton currencyCode={currencyCode} /> : undefined
        }
      />

      {canEdit ? null : (
        <Callout tone="neutral" title="Read-only for your role">
          Editing prices and limits needs the Billing or Super Admin role.
        </Callout>
      )}

      <StatRow>
        <StatTile
          label="Plans"
          value={formatNumber(plans.length)}
          context={`${offered} offered to new signups`}
        />
        <StatTile
          label="Active subscriptions"
          value={formatNumber(totalActive)}
          context="across all plans"
        />
        <StatTile
          label="Recurring revenue"
          value={formatMoney(totalMrr)}
          context="monthly, at the prices below"
        />
        <StatTile
          label="Currency"
          value={currencyCode}
          context="set by ADMIN_CURRENCY; the plan table stores bare numbers"
        />
      </StatRow>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const share =
            totalMrr > 0 ? Math.round((plan.mrr / totalMrr) * 100) : 0;
          return (
            <article
              key={plan.id}
              className={`bg-surface shadow-card relative flex flex-col overflow-hidden rounded-2xl border ${
                plan.isActive ? 'border-ring' : 'border-line opacity-90'
              }`}
            >
              {/* A coloured edge marks a plan that is on sale. */}
              <div
                aria-hidden
                className={`h-1 ${plan.isActive ? 'bg-primary' : 'bg-surface-3'}`}
              />

              <div className="space-y-4 p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-ink truncate text-lg font-semibold">
                      {plan.displayName}
                    </h2>
                    <p className="text-muted text-xs tracking-wide uppercase">
                      {plan.name}
                    </p>
                  </div>
                  {plan.isActive ? (
                    <Pill tone="good" glyph="●">
                      Offered
                    </Pill>
                  ) : (
                    <Pill tone="neutral" glyph="○">
                      Not offered
                    </Pill>
                  )}
                </div>

                <p className="text-ink-2 min-h-10 text-sm leading-relaxed">
                  {plan.description || 'No description.'}
                </p>

                <div>
                  <p className="text-ink tabular flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold tracking-tight">
                      {formatMoney(plan.priceMonthly)}
                    </span>
                    <span className="text-muted text-sm">/ month</span>
                  </p>
                  <p className="text-muted mt-1 text-xs">
                    {plan.priceYearly > 0
                      ? `${formatMoney(plan.priceYearly)} / year`
                      : 'No yearly price'}
                    {plan.priceMonthly > 0 && plan.priceYearly > 0
                      ? ` · ${formatMoney(plan.priceYearly / 12)}/mo effective`
                      : ''}
                    {plan.trialDays ? ` · ${plan.trialDays}-day trial` : ''}
                  </p>
                </div>
              </div>

              <ul className="border-line space-y-2.5 border-t px-6 py-5">
                {limitsOf(plan).map(({ label, value }) => (
                  <li key={label} className="flex items-center gap-2.5 text-sm">
                    <Check
                      aria-hidden
                      className="text-good-fg size-4 shrink-0"
                      strokeWidth={2.4}
                    />
                    <span className="text-ink-2 flex-1">{label}</span>
                    {value === null ? (
                      <span className="text-ink inline-flex items-center gap-1 font-semibold">
                        <InfinityIcon aria-hidden className="size-4" />
                        <span className="sr-only">Unlimited</span>
                      </span>
                    ) : (
                      <span className="text-ink tabular font-semibold">
                        {formatNumber(value)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              <div className="bg-surface-2 border-line mt-auto grid grid-cols-3 gap-3 border-t px-6 py-4 text-center">
                <div>
                  <p className="text-ink tabular text-base font-semibold">
                    {formatNumber(plan.active)}
                  </p>
                  <p className="text-muted text-[11px]">Active</p>
                </div>
                <div>
                  <p className="text-ink tabular text-base font-semibold">
                    {formatNumber(plan.subscribers)}
                  </p>
                  <p className="text-muted text-[11px]">Total</p>
                </div>
                <div>
                  <p className="text-ink tabular text-base font-semibold">
                    {formatMoney(plan.mrr)}
                  </p>
                  <p className="text-muted text-[11px]">
                    {totalMrr > 0 ? `${share}% of MRR` : 'MRR'}
                  </p>
                </div>
              </div>

              <div className="border-line flex items-center justify-between gap-3 border-t px-6 py-3.5">
                <PlanModal
                  label={canEdit ? 'Edit plan' : 'Limits and gateway ids'}
                  title={
                    canEdit
                      ? `Edit ${plan.displayName}`
                      : `${plan.displayName} limits`
                  }
                  description="Prices, limits and availability for this plan."
                >
                  <div>
                    {canEdit ? (
                      <PlanForm
                        planId={plan.id}
                        displayName={plan.displayName}
                        description={plan.description}
                        priceMonthly={plan.priceMonthly}
                        priceYearly={plan.priceYearly}
                        trialDays={plan.trialDays}
                        maxContacts={plan.maxContacts}
                        maxMessagesMonthly={plan.maxMessagesMonthly}
                        maxBroadcastsMonthly={plan.maxBroadcastsMonthly}
                        maxFlows={plan.maxFlows}
                        maxTeamMembers={plan.maxTeamMembers}
                        maxStorageMb={plan.maxStorageMb}
                        isActive={Boolean(plan.isActive)}
                        activeSubscribers={plan.active}
                        currencyCode={currencyCode}
                      />
                    ) : (
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
                        {[
                          {
                            label: 'Trial days',
                            value: plan.trialDays,
                            empty: 'No trial',
                          },
                          ...limitsOf(plan).map((l) => ({
                            ...l,
                            empty: 'Unlimited',
                          })),
                        ].map(({ label, value, empty }) => (
                          <div key={label}>
                            <dt className="text-muted text-xs">{label}</dt>
                            <dd className="text-ink-2 tabular mt-0.5">
                              {value === null ? empty : formatNumber(value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    )}

                    <dl className="text-muted border-line mt-6 grid gap-2 border-t pt-4 text-xs sm:grid-cols-3">
                      <div>
                        <dt>Razorpay plan id</dt>
                        <dd className="text-ink-2 break-all">
                          {plan.razorpayPlanId ?? 'not set'}
                        </dd>
                      </div>
                      <div>
                        <dt>Stripe price (monthly)</dt>
                        <dd className="text-ink-2 break-all">
                          {plan.stripePriceIdMonthly ?? 'not set'}
                        </dd>
                      </div>
                      <div>
                        <dt>Stripe price (yearly)</dt>
                        <dd className="text-ink-2 break-all">
                          {plan.stripePriceIdYearly ?? 'not set'}
                        </dd>
                      </div>
                    </dl>
                    <p className="text-muted mt-2 text-xs leading-relaxed">
                      Gateway ids are read-only here on purpose: the price a
                      customer is charged by Stripe or Razorpay lives at the
                      gateway, and repointing a plan at a different one from an
                      admin form is how someone ends up billed an amount nobody
                      chose. Change those in the gateway dashboard, then mirror
                      the number above.
                    </p>
                    <p className="text-muted mt-2 text-xs">
                      Last changed {formatDate(plan.updatedAt)}.
                    </p>
                  </div>
                </PlanModal>

                <ButtonLink
                  href={`/subscriptions?plan=${encodeURIComponent(plan.name)}`}
                  size="sm"
                >
                  Subscriptions
                </ButtonLink>
              </div>
            </article>
          );
        })}
      </div>

      <DerivedNote>
        <code>subscription_plans</code> has no currency column, so all prices
        are assumed to be in {currencyCode}. If you ever sell in a second
        currency, that needs a schema change rather than a second set of plans.
      </DerivedNote>
    </div>
  );
}
