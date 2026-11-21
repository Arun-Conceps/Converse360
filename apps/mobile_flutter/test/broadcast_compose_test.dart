import 'package:flutter_test/flutter_test.dart';
import 'package:converse360/core/broadcast_compose.dart';

ComposeTemplate t({String? header, String? headerContent, dynamic buttons}) =>
    ComposeTemplate(
      name: 'promo',
      language: 'en_US',
      body: 'Hi {{1}}, your code is {{2}}. Hi again {{1}}.',
      headerType: header,
      headerContent: headerContent,
      buttons: buttons,
    );

void main() {
  test('variable keys are distinct and numerically ordered', () {
    expect(templateVariableKeys('a {{10}} b {{2}} c {{2}} {{ 1 }}'), [
      '1',
      '2',
      '10',
    ]);
    expect(templateVariableKeys('no variables'), isEmpty);
  });

  group('unsupportedReason', () {
    test('plain body templates are supported', () {
      expect(t().unsupportedReason, isNull);
      expect(t(header: 'NONE').unsupportedReason, isNull);
      expect(
        t(header: 'TEXT', headerContent: 'Sale').unsupportedReason,
        isNull,
      );
    });

    test(
      'media, location and variable headers/buttons are left to the web',
      () {
        expect(t(header: 'IMAGE').unsupportedReason, isNotNull);
        expect(t(header: 'video').unsupportedReason, isNotNull);
        expect(t(header: 'LOCATION').unsupportedReason, isNotNull);
        expect(
          t(header: 'TEXT', headerContent: 'Hi {{1}}').unsupportedReason,
          isNotNull,
        );
        expect(
          t(
            buttons: [
              {'type': 'URL', 'url': 'https://x.test/{{1}}'},
            ],
          ).unsupportedReason,
          isNotNull,
        );
      },
    );

    test('a static URL button is fine', () {
      expect(
        t(
          buttons: [
            {'type': 'URL', 'url': 'https://x.test/'},
          ],
        ).unsupportedReason,
        isNull,
      );
    });
  });

  test('an audience is incomplete until it names something', () {
    expect(const AudiencePick(AudienceKind.all).isComplete, isTrue);
    expect(const AudiencePick(AudienceKind.tags).isComplete, isFalse);
    expect(
      const AudiencePick(AudienceKind.segments, ids: ['s']).isComplete,
      isTrue,
    );
  });

  test('variablesComplete rejects missing and blank static values', () {
    expect(variablesComplete(['1'], {}), isFalse);
    expect(variablesComplete(['1'], {'1': const StaticFill('  ')}), isFalse);
    expect(variablesComplete(['1'], {'1': const StaticFill('x')}), isTrue);
    expect(variablesComplete(['1'], {'1': const FieldFill('name')}), isTrue);
  });

  test('request body matches what POST /whatsapp/broadcasts expects', () {
    final body = buildBroadcastBody(
      name: '  Spring  ',
      template: t(),
      audience: const AudiencePick(AudienceKind.tags, ids: ['tag-1']),
      fills: {'1': const FieldFill('name'), '2': const StaticFill('SPRING10')},
    );
    expect(body, {
      'name': 'Spring',
      'template_name': 'promo',
      'template_language': 'en_US',
      'audience': {
        'type': 'tags',
        'tagIds': ['tag-1'],
      },
      'variables': {
        '1': {'type': 'field', 'value': 'name'},
        '2': {'type': 'static', 'value': 'SPRING10'},
      },
    });
  });

  group('scheduling', () {
    final now = DateTime(2026, 11, 21, 10);
    test('needs at least a minute of lead and at most 90 days', () {
      expect(scheduleError(now.add(const Duration(seconds: 30)), now), isNotNull);
      expect(scheduleError(now.subtract(const Duration(hours: 1)), now), isNotNull);
      expect(scheduleError(now.add(const Duration(minutes: 5)), now), isNull);
      expect(scheduleError(now.add(const Duration(days: 91)), now), isNotNull);
    });

    test('scheduled_at is sent as a UTC instant, and omitted when sending now', () {
      final at = DateTime.utc(2026, 12, 1, 4, 30);
      Map<String, dynamic> body(DateTime? when) => buildBroadcastBody(
        name: 'n',
        template: ComposeTemplate(name: 'p', language: 'en', body: 'hi'),
        audience: const AudiencePick(AudienceKind.all),
        fills: const {},
        scheduledAt: when,
      );
      expect(body(at)['scheduled_at'], '2026-12-01T04:30:00.000Z');
      expect(body(null).containsKey('scheduled_at'), isFalse);
    });
  });

  test('preview substitutes what it can and leaves the rest visible', () {
    expect(
      previewBody('Hi {{1}}, code {{2}}', {'1': const FieldFill('name')}),
      'Hi [name], code {{2}}',
    );
  });
}
