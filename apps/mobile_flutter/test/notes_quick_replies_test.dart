import 'package:converse360/core/mentions.dart';
import 'package:converse360/core/quick_replies.dart';
import 'package:flutter_test/flutter_test.dart';

QuickReply qr(String s, String body, [int use = 0]) =>
    QuickReply(id: s, shortcut: s, body: body, useCount: use);

void main() {
  group('mentions', () {
    final list = buildMentionables([
      (userId: 'u1', fullName: 'Asha Rao', email: 'asha@x.com'),
      (userId: 'u2', fullName: 'Asha Rao', email: 'asha.r@x.com'),
      (userId: 'u3', fullName: 'Ash', email: null),
    ]);

    test('duplicate labels are made unique', () {
      expect(list[0].name, 'Asha Rao');
      expect(list[1].name, 'Asha Rao (asha.r)');
    });

    test('email addresses never open the picker', () {
      expect(findMentionQuery('mail a@b', 8), isNull);
      expect(findMentionQuery('hi @as', 6)?.query, 'as');
      expect(findMentionQuery('@', 1)?.start, 0);
    });

    test('extract is driven by the final text, longest name wins', () {
      expect(extractMentionedIds('ping @Asha Rao please', list), ['u1']);
      // "@Ash" must not match inside "@Ashley"
      expect(extractMentionedIds('@Ashley', list), isEmpty);
      // deleted mention yields no id
      expect(extractMentionedIds('no mention', list), isEmpty);
    });

    test('applyMention and splitMentions', () {
      final r = applyMention('hi @as', 3, 6, 'Asha Rao');
      expect(r.text, 'hi @Asha Rao ');
      expect(r.caret, 13);
      final segs = splitMentions('hi @Asha Rao ok', list);
      expect(segs.map((s) => s.text), ['hi ', '@Asha Rao', ' ok']);
      expect(segs[1].userId, 'u1');
    });

    test('filterMentionables prefers word starts', () {
      expect(filterMentionables(list, 'ra').first.userId, 'u1');
    });
  });

  group('quick replies', () {
    test('trigger only for a leading slash without whitespace', () {
      expect(triggerQuery('/pri'), 'pri');
      expect(triggerQuery('/'), '');
      expect(triggerQuery('and/or'), isNull);
      expect(triggerQuery('/pricing now'), isNull);
    });

    test('normaliseShortcut matches the DB CHECK', () {
      expect(normaliseShortcut('/Price List!'), 'price-list');
      expect(isValidShortcut(normaliseShortcut('/Price List!')), isTrue);
      expect(isValidShortcut('has space'), isFalse);
      expect(normaliseShortcut('a' * 50).length, 32);
    });

    test('filter: prefix first, then most used', () {
      final r = [qr('pricing', 'x', 1), qr('priority', 'x', 5), qr('hello', 'mentions pri')];
      expect(filterQuickReplies(r, 'pri').map((e) => e.shortcut),
          ['priority', 'pricing', 'hello']);
    });

    test('fill leaves unknown tokens, uses "there" for no name', () {
      expect(fillQuickReply('Hi {{name}} / {{first_name}} / {{x}}', name: 'Meera Kapoor'),
          'Hi Meera Kapoor / Meera / {{x}}');
      expect(fillQuickReply('Hi {{name}},'), 'Hi there,');
    });
  });
}
