// Subset of apps/web/src/types/index.ts the mobile app reads. Field names match
// the database. Widen when a screen needs more.

enum Channel { whatsapp, instagram, web }

Channel channelFrom(Object? v) => switch (v) {
      'instagram' => Channel.instagram,
      'web' => Channel.web,
      // A missing channel means WhatsApp: older realtime payloads omit it.
      _ => Channel.whatsapp,
    };

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v) : null;

class Contact {
  const Contact({
    required this.id,
    this.phone,
    this.igUsername,
    this.name,
    this.company,
  });
  final String id;
  final String? phone;
  final String? igUsername;
  final String? name;
  final String? company;

  factory Contact.fromJson(Map<String, dynamic> j) => Contact(
        id: j['id'] as String,
        phone: j['phone'] as String?,
        igUsername: j['ig_username'] as String?,
        name: j['name'] as String?,
        company: j['company'] as String?,
      );
}

class Conversation {
  const Conversation({
    required this.id,
    required this.status,
    required this.channel,
    required this.unreadCount,
    this.assignedAgentId,
    this.lastMessageText,
    this.lastMessageAt,
    this.lastInboundAt,
    this.contact,
  });
  final String id;
  final String status; // open | pending | closed
  final Channel channel;
  final int unreadCount;
  final String? assignedAgentId;
  final String? lastMessageText;
  final DateTime? lastMessageAt;
  final DateTime? lastInboundAt;
  final Contact? contact;

  bool get isClosed => status == 'closed';

  factory Conversation.fromJson(Map<String, dynamic> j) => Conversation(
        id: j['id'] as String,
        status: (j['status'] as String?) ?? 'open',
        channel: channelFrom(j['channel']),
        unreadCount: (j['unread_count'] as num?)?.toInt() ?? 0,
        assignedAgentId: j['assigned_agent_id'] as String?,
        lastMessageText: j['last_message_text'] as String?,
        lastMessageAt: _date(j['last_message_at']),
        lastInboundAt: _date(j['last_inbound_at']),
        contact: j['contact'] is Map<String, dynamic>
            ? Contact.fromJson(j['contact'] as Map<String, dynamic>)
            : null,
      );
}

class Message {
  const Message({
    required this.id,
    required this.senderType,
    required this.contentType,
    required this.status,
    required this.createdAt,
    this.contentText,
    this.templateName,
    this.mediaUrl,
  });
  final String id;
  final String senderType; // customer | agent | bot
  final String contentType;
  final String status; // sending | sent | delivered | read | failed
  final DateTime createdAt;
  final String? contentText;
  final String? templateName;

  /// Public https URL only; inbound Meta media may be an opaque id instead.
  final String? mediaUrl;

  bool get fromCustomer => senderType == 'customer';

  factory Message.fromJson(Map<String, dynamic> j) => Message(
        id: j['id'] as String,
        senderType: j['sender_type'] as String,
        contentType: (j['content_type'] as String?) ?? 'text',
        status: (j['status'] as String?) ?? 'sent',
        createdAt: DateTime.parse(j['created_at'] as String),
        contentText: j['content_text'] as String?,
        templateName: j['template_name'] as String?,
        mediaUrl: j['media_url'] as String?,
      );
}

class Workspace {
  const Workspace({
    required this.id,
    required this.name,
    required this.role,
    this.planName,
    this.standing,
    this.subscriptionStatus,
  });
  final String id;
  final String name;
  final String role; // owner | admin | agent | viewer
  final String? planName;
  final String? standing; // good | grace | lapsed
  final String? subscriptionStatus;

  factory Workspace.fromJson(Map<String, dynamic> j) => Workspace(
        id: j['id'] as String,
        name: j['name'] as String,
        role: (j['role'] as String?) ?? 'agent',
        planName: j['plan_name'] as String?,
        standing: j['standing'] as String?,
        subscriptionStatus: j['subscription_status'] as String?,
      );
}
