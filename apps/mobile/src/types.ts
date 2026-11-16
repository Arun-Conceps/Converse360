// Subset of apps/web/src/types/index.ts the mobile app reads. Keep field names
// identical to the database; widen this file when a screen needs more.
export type ConversationChannel = 'whatsapp' | 'instagram' | 'web';
export type ConversationStatus = 'open' | 'pending' | 'closed';
export type SenderType = 'customer' | 'agent' | 'bot';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Contact {
  id: string;
  account_id: string;
  phone: string | null;
  ig_username?: string | null;
  name?: string | null;
  company?: string | null;
}

export interface Conversation {
  id: string;
  account_id: string;
  contact_id: string;
  status: ConversationStatus;
  channel?: ConversationChannel;
  assigned_agent_id?: string | null;
  last_message_text?: string | null;
  last_message_at?: string | null;
  last_inbound_at?: string | null;
  unread_count: number;
  ai_autoreply_disabled?: boolean;
  contact?: Contact | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_type: SenderType;
  content_type: string;
  content_text?: string | null;
  media_url?: string | null;
  template_name?: string | null;
  status: MessageStatus;
  created_at: string;
}

export type Standing = 'good' | 'grace' | 'lapsed';
export type Role = 'owner' | 'admin' | 'agent' | 'viewer';

export interface Workspace {
  id: string;
  name: string;
  logo_url: string | null;
  role: Role;
  is_owner: boolean;
  plan_name: string | null;
  subscription_status: string | null;
  standing: Standing | null;
  trial_end_at: string | null;
}
