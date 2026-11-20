import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../core/api.dart';
import '../core/theme.dart';
import '../state/auth.dart';

/// Scans the QR on the web login page and approves it, signing the web in as
/// the account this phone is signed in to. The QR is `c360qr:<id>:<secret>`.
class ScanQrScreen extends ConsumerStatefulWidget {
  const ScanQrScreen({super.key});

  @override
  ConsumerState<ScanQrScreen> createState() => _ScanQrScreenState();
}

class _ScanQrScreenState extends ConsumerState<ScanQrScreen> {
  final _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _busy = false;
  String? _message;
  bool _done = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _onDetect(BarcodeCapture capture) async {
    if (_busy || _done) return;
    final raw = capture.barcodes
        .map((b) => b.rawValue)
        .whereType<String>()
        .firstWhere((v) => v.startsWith('c360qr:'), orElse: () => '');
    if (raw.isEmpty) return;
    final parts = raw.split(':');
    if (parts.length != 3) {
      setState(() => _message = 'That is not a Converse360 sign-in code.');
      return;
    }
    setState(() {
      _busy = true;
      _message = null;
    });
    try {
      await ref
          .read(apiProvider)
          .request(
            'POST',
            '/auth/qr/approve',
            body: {'id': parts[1], 'secret': parts[2]},
          );
      if (!mounted) return;
      setState(() {
        _done = true;
        _message = 'Done. Your web browser is signing in.';
      });
    } on ApiException catch (e) {
      if (mounted) setState(() => _message = e.message);
    } catch (_) {
      if (mounted) setState(() => _message = 'Could not reach the server.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Sign in on web')),
      body: Column(
        children: [
          Expanded(
            child: _done
                ? const Center(
                    child: Icon(Icons.check_circle, color: C.accent, size: 96),
                  )
                : MobileScanner(
                    controller: _controller,
                    onDetect: _onDetect,
                    errorBuilder: (context, error) => Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Text(
                          'Camera unavailable (${error.errorCode.name}). Allow camera access in Settings.',
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ),
                  ),
          ),
          Padding(
            padding: const EdgeInsets.all(20),
            child: Text(
              _busy
                  ? 'Approving…'
                  : (_message ??
                        'Open the web login page, choose "Sign in with phone", and point the camera at the code.'),
              textAlign: TextAlign.center,
              style: const TextStyle(color: C.muted),
            ),
          ),
        ],
      ),
    );
  }
}
