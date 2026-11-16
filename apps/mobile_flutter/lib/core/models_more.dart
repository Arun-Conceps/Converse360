// Models for notes, deals, broadcasts, templates, notifications and teammates.
// Field names match the database (see apps/web/src/types/index.ts).

DateTime? _d(Object? v) => v is String ? DateTime.tryParse(v) : null;
int _i(Object? v) => (v as num?)?.toInt() ?? 0;

class TeamMember {
  const TeamMember({required this.userId, this.fullName, this.email});
  final String userId;
  final String? fullName;
  final String? email;
}

class ContactNote {
  const ContactNote({
    required this.id,
    required this.contactId,
    required this.userId,
    required this.text,
    required this.createdAt,
    this.mentionedUserIds = const [],
  });
  final String id;
  final String contactId;
  final String userId;
  final String text;
  final DateTime createdAt;
  final List<String> mentionedUserIds;

  factory ContactNote.fromJson(Map<String, dynamic> j) => ContactNote(
        id: j['id'] as String,
        contactId: j['contact_id'] as String,
        userId: j['user_id'] as String,
        text: (j['note_text'] as String?) ?? '',
        createdAt: DateTime.parse(j['created_at'] as String),
        mentionedUserIds:
            ((j['mentioned_user_ids'] as List?) ?? const []).cast<String>(),
      );
}

class Stage {
  const Stage({required this.id, required this.name, required this.position});
  final String id;
  final String name;
  final int position;
  factory Stage.fromJson(Map<String, dynamic> j) => Stage(
      id: j['id'] as String,
      name: j['name'] as String,
      position: _i(j['position']));
}

class Deal {
  const Deal({
    required this.id,
    required this.stageId,
    required this.title,
    required this.value,
    this.currency,
    this.contactName,
    this.contactId,
  });
  final String id;
  final String stageId;
  final String title;
  final num value;
  final String? currency;
  final String? contactName;
  final String? contactId;

  Deal copyWith({String? stageId}) => Deal(
      id: id,
      stageId: stageId ?? this.stageId,
      title: title,
      value: value,
      currency: currency,
      contactName: contactName,
      contactId: contactId);

  factory Deal.fromJson(Map<String, dynamic> j) {
    final c = j['contact'];
    return Deal(
      id: j['id'] as String,
      stageId: j['stage_id'] as String,
      title: (j['title'] as String?) ?? 'Deal',
      value: (j['value'] as num?) ?? 0,
      currency: j['currency'] as String?,
      contactId: j['contact_id'] as String?,
      contactName: c is Map ? (c['name'] ?? c['phone']) as String? : null,
    );
  }
}

class DealBoard {
  const DealBoard({this.pipelineName, this.stages = const [], this.deals = const []});
  final String? pipelineName;
  final List<Stage> stages;
  final List<Deal> deals;
}

class Broadcast {
  const Broadcast({
    required this.id,
    required this.name,
    required this.templateName,
    required this.status,
    required this.total,
    required this.sent,
    required this.delivered,
    required this.read,
    required this.replied,
    required this.failed,
    required this.createdAt,
    this.scheduledAt,
  });
  final String id;
  final String name;
  final String templateName;
  final String status; // draft | queued | sending | sent | failed | scheduled
  final int total, sent, delivered, read, replied, failed;
  final DateTime createdAt;
  final DateTime? scheduledAt;

  factory Broadcast.fromJson(Map<String, dynamic> j) => Broadcast(
        id: j['id'] as String,
        name: (j['name'] as String?) ?? 'Broadcast',
        templateName: (j['template_name'] as String?) ?? '',
        status: (j['status'] as String?) ?? 'draft',
        total: _i(j['total_recipients']),
        sent: _i(j['sent_count']),
        delivered: _i(j['delivered_count']),
        read: _i(j['read_count']),
        replied: _i(j['replied_count']),
        failed: _i(j['failed_count']),
        createdAt: DateTime.parse(j['created_at'] as String),
        scheduledAt: _d(j['scheduled_at']),
      );
}

class Template {
  const Template({
    required this.id,
    required this.name,
    required this.category,
    required this.body,
    required this.status,
    this.rejectionReason,
  });
  final String id;
  final String name;
  final String category;
  final String body;
  final String status; // APPROVED | PENDING | REJECTED | ...
  final String? rejectionReason;

  factory Template.fromJson(Map<String, dynamic> j) => Template(
        id: j['id'] as String,
        name: j['name'] as String,
        category: (j['category'] as String?) ?? '',
        body: (j['body_text'] as String?) ?? '',
        status: (j['status'] as String?) ?? 'PENDING',
        rejectionReason: j['rejection_reason'] as String?,
      );
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.createdAt,
    this.body,
    this.conversationId,
    this.readAt,
  });
  final String id;
  final String type; // conversation_assigned | note_mention | automation
  final String title;
  final String? body;
  final String? conversationId;
  final DateTime createdAt;
  final DateTime? readAt;
  bool get unread => readAt == null;

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: j['id'] as String,
        type: (j['type'] as String?) ?? '',
        title: (j['title'] as String?) ?? '',
        body: j['body'] as String?,
        conversationId: j['conversation_id'] as String?,
        createdAt: DateTime.parse(j['created_at'] as String),
        readAt: _d(j['read_at']),
      );
}
