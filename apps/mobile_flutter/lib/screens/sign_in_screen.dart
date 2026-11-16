import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/theme.dart';
import '../state/auth.dart';
import '../ui/widgets.dart';

class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});
  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final msg = await ref
        .read(authProvider.notifier)
        .signIn(_email.text, _password.text);
    // On success the auth state machine redirects; nothing to navigate here.
    if (mounted) {
      setState(() {
        _busy = false;
        _error = msg;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 10,
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: Container(
                    width: 56,
                    height: 56,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                        color: C.accent,
                        borderRadius: BorderRadius.circular(16)),
                    child: const Text('C',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.w700)),
                  ),
                ),
                const Text('Converse360',
                    style:
                        TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
                const Text('Your team inbox, in your pocket.',
                    style: TextStyle(color: C.muted)),
                const SizedBox(height: 6),
                TextField(
                  controller: _email,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  decoration: const InputDecoration(labelText: 'Email'),
                  onChanged: (_) => setState(() {}),
                ),
                TextField(
                  controller: _password,
                  obscureText: true,
                  autofillHints: const [AutofillHints.password],
                  decoration: const InputDecoration(labelText: 'Password'),
                  onChanged: (_) => setState(() {}),
                  onSubmitted: (_) => _submit(),
                ),
                if (_error != null)
                  Text(_error!, style: const TextStyle(color: C.bad)),
                AppButton('Sign in',
                    primary: true,
                    loading: _busy,
                    onPressed: _email.text.isEmpty || _password.text.isEmpty
                        ? null
                        : _submit),
                const Text(
                  'Same login as the web app. Settings and billing stay on the web.',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: C.muted, fontSize: 12),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
