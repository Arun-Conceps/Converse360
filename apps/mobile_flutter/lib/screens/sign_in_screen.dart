import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../state/auth.dart';
import '../ui/brand.dart';
import '../ui/widgets.dart';

const _brandGreen = Color(0xFF00AC55);

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});
  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen>
    with TickerProviderStateMixin {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _passwordFocus = FocusNode();

  /// Loops forever: drifting background blobs, floating bubbles, typing dots.
  /// Every use is periodic in whole cycles so the loop has no visible seam.
  late final AnimationController _bg =
      AnimationController(vsync: this, duration: const Duration(seconds: 18))
        ..repeat();

  /// One-shot entrance; each element reads its own Interval of it.
  late final AnimationController _enter = AnimationController(
      vsync: this, duration: const Duration(milliseconds: 1500))
    ..forward();

  late final AnimationController _shake =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 460));

  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _bg.dispose();
    _enter.dispose();
    _shake.dispose();
    _email.dispose();
    _password.dispose();
    _passwordFocus.dispose();
    super.dispose();
  }

  bool get _canSubmit =>
      _email.text.trim().isNotEmpty && _password.text.isNotEmpty;

  Future<void> _submit() async {
    if (!_canSubmit || _busy) return;
    FocusScope.of(context).unfocus();
    TextInput.finishAutofillContext();
    setState(() {
      _busy = true;
      _error = null;
    });
    final msg = await ref
        .read(authProvider.notifier)
        .signIn(_email.text, _password.text);
    // On success the auth state machine redirects; nothing to navigate here.
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = msg;
    });
    if (msg != null) {
      HapticFeedback.mediumImpact();
      _shake.forward(from: 0);
    }
  }

  /// Fade + rise, starting at [begin] (0..1) of the entrance timeline.
  Widget _stagger(double begin, Widget child) {
    final a = CurvedAnimation(
      parent: _enter,
      curve: Interval(begin, math.min(1, begin + 0.45),
          curve: Curves.easeOutCubic),
    );
    return FadeTransition(
      opacity: a,
      child: SlideTransition(
        position: Tween(begin: const Offset(0, 0.22), end: Offset.zero)
            .animate(a),
        child: child,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final keyboardUp = MediaQuery.viewInsetsOf(context).bottom > 0;

    return Scaffold(
      backgroundColor: Colors.white,
      body: Stack(
        children: [
          // Drifting brand-colour glows behind everything.
          Positioned.fill(
            child: AnimatedBuilder(
              animation: _bg,
              builder: (_, _) => CustomPaint(painter: _BlobsPainter(_bg.value)),
            ),
          ),
          SafeArea(
            child: LayoutBuilder(
              builder: (context, box) => Column(
                children: [
                  const SizedBox(height: 28),
                  _stagger(
                    0.0,
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 24),
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: BrandWordmark(width: 190),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Center(
                      child: AnimatedSize(
                        duration: const Duration(milliseconds: 280),
                        curve: Curves.easeOutCubic,
                        child: keyboardUp
                            ? const SizedBox(width: double.infinity)
                            : _ChatPreview(enter: _enter, bg: _bg),
                      ),
                    ),
                  ),
                  // The form card rises from the bottom edge.
                  SlideTransition(
                    position: Tween(
                            begin: const Offset(0, 0.35), end: Offset.zero)
                        .animate(CurvedAnimation(
                            parent: _enter,
                            curve: const Interval(0.15, 0.75,
                                curve: Curves.easeOutCubic))),
                    child: FadeTransition(
                      opacity: CurvedAnimation(
                          parent: _enter,
                          curve: const Interval(0.15, 0.6)),
                      child: AnimatedBuilder(
                        animation: _shake,
                        builder: (_, child) => Transform.translate(
                          offset: Offset(
                              math.sin(_shake.value * math.pi * 6) *
                                  9 *
                                  (1 - _shake.value),
                              0),
                          child: child,
                        ),
                        child: _card(box.maxHeight * 0.82),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _card(double maxHeight) {
    return Container(
      width: double.infinity,
      constraints: BoxConstraints(maxHeight: maxHeight),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(30)),
        boxShadow: [
          BoxShadow(
              color: Color(0x1A0B7A5C), blurRadius: 36, offset: Offset(0, -10)),
        ],
      ),
      child: SingleChildScrollView(
        keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
        padding: const EdgeInsets.fromLTRB(24, 26, 24, 14),
        child: AutofillGroup(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              _stagger(
                0.30,
                const Text('Welcome back',
                    style: TextStyle(
                        fontSize: 28,
                        height: 1.15,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.5,
                        color: C.fg)),
              ),
              const SizedBox(height: 6),
              _stagger(
                0.36,
                const Text('Sign in to your team inbox, contacts and deals.',
                    style: TextStyle(fontSize: 14.5, height: 1.4, color: C.muted)),
              ),
              const SizedBox(height: 22),
              _stagger(
                0.44,
                TextField(
                  controller: _email,
                  enabled: !_busy,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autocorrect: false,
                  autofillHints: const [
                    AutofillHints.email,
                    AutofillHints.username
                  ],
                  decoration: const InputDecoration(
                    labelText: 'Email',
                    prefixIcon: Icon(Icons.mail_outline_rounded, size: 20),
                  ),
                  onChanged: (_) => setState(() => _error = null),
                  onSubmitted: (_) => _passwordFocus.requestFocus(),
                ),
              ),
              const SizedBox(height: 12),
              _stagger(
                0.52,
                TextField(
                  controller: _password,
                  focusNode: _passwordFocus,
                  enabled: !_busy,
                  obscureText: _obscure,
                  textInputAction: TextInputAction.done,
                  autofillHints: const [AutofillHints.password],
                  decoration: InputDecoration(
                    labelText: 'Password',
                    prefixIcon:
                        const Icon(Icons.lock_outline_rounded, size: 20),
                    suffixIcon: IconButton(
                      tooltip: _obscure ? 'Show password' : 'Hide password',
                      icon: AnimatedSwitcher(
                        duration: const Duration(milliseconds: 180),
                        child: Icon(
                          _obscure
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          key: ValueKey(_obscure),
                          size: 20,
                        ),
                      ),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                  onChanged: (_) => setState(() => _error = null),
                  onSubmitted: (_) => _submit(),
                ),
              ),
              AnimatedSize(
                duration: const Duration(milliseconds: 220),
                curve: Curves.easeOut,
                alignment: Alignment.topCenter,
                child: _error == null
                    ? const SizedBox(width: double.infinity)
                    : Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: C.badSoft,
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            spacing: 10,
                            children: [
                              const Icon(Icons.error_outline_rounded,
                                  size: 18, color: C.bad),
                              Expanded(
                                child: Text(_error!,
                                    style: const TextStyle(
                                        color: C.bad, fontSize: 13.5)),
                              ),
                            ],
                          ),
                        ),
                      ),
              ),
              const SizedBox(height: 18),
              _stagger(
                0.60,
                AppButton('Sign in',
                    primary: true,
                    loading: _busy,
                    onPressed: _canSubmit ? _submit : null),
              ),
              _stagger(
                0.68,
                const Padding(
                  padding: EdgeInsets.fromLTRB(8, 16, 8, 6),
                  child: Text(
                    'Same login as the web app. Plans and billing are managed on the web.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: C.muted, fontSize: 12.5, height: 1.4),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Three soft brand-colour glows that drift along looping paths.
class _BlobsPainter extends CustomPainter {
  _BlobsPainter(this.t);
  final double t;

  static const _colors = [
    _brandGreen,
    Color(0xFF0B7A5C),
    Color(0xFF7FD6A8),
  ];

  @override
  void paint(Canvas canvas, Size size) {
    for (var i = 0; i < _colors.length; i++) {
      final a = 2 * math.pi * t;
      final ph = i * 2.1;
      final cx = size.width * (0.5 + 0.42 * math.sin(a + ph));
      final cy = size.height * (0.18 + 0.20 * math.cos(2 * a + ph * 1.3));
      final r = size.width * (0.62 + 0.12 * i);
      final rect = Rect.fromCircle(center: Offset(cx, cy), radius: r);
      canvas.drawCircle(
        Offset(cx, cy),
        r,
        Paint()
          ..shader = RadialGradient(colors: [
            _colors[i].withValues(alpha: 0.20),
            _colors[i].withValues(alpha: 0.0),
          ]).createShader(rect),
      );
    }
  }

  @override
  bool shouldRepaint(_BlobsPainter old) => old.t != t;
}

/// A tiny looping conversation: the product, shown rather than described.
class _ChatPreview extends StatelessWidget {
  const _ChatPreview({required this.enter, required this.bg});
  final Animation<double> enter;
  final Animation<double> bg;

  Widget _bubble({
    required double begin,
    required double phase,
    required Alignment align,
    required Widget child,
    required bool out,
  }) {
    final a = CurvedAnimation(
      parent: enter,
      curve: Interval(begin, math.min(1, begin + 0.3), curve: Curves.easeOutBack),
    );
    return AnimatedBuilder(
      animation: Listenable.merge([a, bg]),
      builder: (_, _) {
        final float = math.sin(2 * math.pi * (bg.value * 2 + phase)) * 4;
        return Align(
          alignment: align,
          child: Opacity(
            opacity: a.value.clamp(0.0, 1.0),
            child: Transform.translate(
              offset: Offset(out ? 24 * (1 - a.value) : -24 * (1 - a.value),
                  float),
              child: Transform.scale(
                scale: 0.85 + 0.15 * a.value,
                alignment: out ? Alignment.centerRight : Alignment.centerLeft,
                child: child,
              ),
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    const shadow = [
      BoxShadow(color: Color(0x14000000), blurRadius: 14, offset: Offset(0, 5)),
    ];
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 330),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          spacing: 12,
          children: [
            _bubble(
              begin: 0.18,
              phase: 0.0,
              align: Alignment.centerLeft,
              out: false,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  boxShadow: shadow,
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(16),
                    topRight: Radius.circular(16),
                    bottomRight: Radius.circular(16),
                    bottomLeft: Radius.circular(4),
                  ),
                ),
                child: const Text('Hi! Is my order on the way? 📦',
                    style: TextStyle(fontSize: 14, color: C.fg)),
              ),
            ),
            _bubble(
              begin: 0.34,
              phase: 0.33,
              align: Alignment.centerRight,
              out: true,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                decoration: const BoxDecoration(
                  color: _brandGreen,
                  boxShadow: [
                    BoxShadow(
                        color: Color(0x3300AC55),
                        blurRadius: 16,
                        offset: Offset(0, 6)),
                  ],
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(16),
                    topRight: Radius.circular(16),
                    bottomLeft: Radius.circular(16),
                    bottomRight: Radius.circular(4),
                  ),
                ),
                child: const Text('Out for delivery, arriving by 6 PM ✅',
                    style: TextStyle(fontSize: 14, color: Colors.white)),
              ),
            ),
            _bubble(
              begin: 0.50,
              phase: 0.66,
              align: Alignment.centerLeft,
              out: false,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  boxShadow: shadow,
                  borderRadius: BorderRadius.only(
                    topLeft: Radius.circular(16),
                    topRight: Radius.circular(16),
                    bottomRight: Radius.circular(16),
                    bottomLeft: Radius.circular(4),
                  ),
                ),
                child: _TypingDots(bg: bg),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TypingDots extends StatelessWidget {
  const _TypingDots({required this.bg});
  final Animation<double> bg;

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: bg,
        builder: (_, _) => Row(
          mainAxisSize: MainAxisSize.min,
          spacing: 5,
          children: List.generate(3, (i) {
            // 18 whole cycles per loop = one bounce per second, seamless.
            final s = math.sin(2 * math.pi * (bg.value * 18 - i * 0.14));
            final lift = math.max(0.0, s);
            return Transform.translate(
              offset: Offset(0, -4 * lift),
              child: Container(
                width: 7,
                height: 7,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Color.lerp(
                      const Color(0xFFB8C4BE), _brandGreen, lift),
                ),
              ),
            );
          }),
        ),
      );
}
