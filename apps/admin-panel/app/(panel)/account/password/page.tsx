import type { Metadata } from 'next';

import { PasswordForm } from '@/components/staff/password-form';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Callout, PageHeader } from '@/components/ui/page';
import { requireStaff } from '@/lib/auth';
import { MIN_PASSWORD_LENGTH } from '@/lib/staff/password';

export const metadata: Metadata = {
  title: 'Change password · Converse360 Control Center',
};

/** Changing your own password. Open to every signed-in staff member. */
export default async function ChangePasswordPage() {
  const staff = await requireStaff();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Change password"
        description="This signs out every other session you have, a stolen cookie included."
      />
      <Card>
        <CardHeader title="New password" />
        <CardBody>
          {staff.isBreakGlass ? (
            <Callout tone="warn" title="Break-glass login">
              This login is set by <code>ADMIN_USERNAME</code> and{' '}
              <code>ADMIN_PASSWORD</code> in the deployment env file, so it has
              no stored password to change here. Create your own user in
              Settings → Users and use that day to day.
            </Callout>
          ) : (
            <PasswordForm minLength={MIN_PASSWORD_LENGTH} />
          )}
        </CardBody>
      </Card>
    </div>
  );
}
