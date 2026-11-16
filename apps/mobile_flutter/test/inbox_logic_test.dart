import 'package:converse360/core/inbox_logic.dart';
import 'package:converse360/core/models.dart';
import 'package:flutter_test/flutter_test.dart';

final now = DateTime.utc(2026, 11, 16, 12);
DateTime ago(int h) => now.subtract(Duration(hours: h));

Conversation conv({
  Channel channel = Channel.whatsapp,
  DateTime? inbound,
  String? agent,
  int unread = 0,
}) =>
    Conversation(
      id: 'c1',
      status: 'open',
      channel: channel,
      unreadCount: unread,
      assignedAgentId: agent,
      lastInboundAt: inbound,
    );

void main() {
  group('isReplyWindowOpen', () {
    test('open within 24h, closed after', () {
      expect(isReplyWindowOpen(conv(inbound: ago(23)), now: now), isTrue);
      expect(isReplyWindowOpen(conv(inbound: ago(25)), now: now), isFalse);
    });
    test('closed when the customer never wrote', () {
      expect(isReplyWindowOpen(conv(), now: now), isFalse);
    });
    test('never closes on the web widget', () {
      expect(
        isReplyWindowOpen(conv(channel: Channel.web, inbound: ago(500)),
            now: now),
        isTrue,
      );
    });
    test('missing channel in JSON is WhatsApp', () {
      final c = Conversation.fromJson({
        'id': 'x',
        'last_inbound_at': ago(30).toIso8601String(),
      });
      expect(c.channel, Channel.whatsapp);
      expect(isReplyWindowOpen(c, now: now), isFalse);
    });
  });

  test('filters', () {
    expect(matchesFilter(conv(agent: 'u1'), InboxFilter.mine, 'u1'), isTrue);
    expect(matchesFilter(conv(agent: 'u2'), InboxFilter.mine, 'u1'), isFalse);
    expect(matchesFilter(conv(), InboxFilter.unassigned, 'u1'), isTrue);
    expect(matchesFilter(conv(unread: 2), InboxFilter.unread, 'u1'), isTrue);
    expect(matchesFilter(conv(), InboxFilter.unread, 'u1'), isFalse);
  });

  test('contactName falls back name, phone, handle, Unknown', () {
    expect(contactName(const Contact(id: '1', name: ' Meera ', phone: '+91')),
        'Meera');
    expect(contactName(const Contact(id: '1', name: '', phone: '+91 98')),
        '+91 98');
    expect(contactName(const Contact(id: '1', igUsername: 'sana')), '@sana');
    expect(contactName(null), 'Unknown');
  });

  test('initials and relativeTime', () {
    expect(initials('Meera Kapoor'), 'MK');
    expect(initials('@sana'), 'S');
    expect(relativeTime(ago(3), now: now), '3h');
    expect(relativeTime(now, now: now), 'now');
  });
}
