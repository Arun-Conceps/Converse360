import { MembersTab } from '@/components/settings/members-tab';

export default function MembersPage() {
  // MembersTab renders its own heading (SettingsPanelHead); a second one here
  // made the title appear twice (BUG-016).
  return <MembersTab />;
}
