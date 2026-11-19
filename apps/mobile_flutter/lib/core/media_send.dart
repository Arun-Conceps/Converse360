import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mime/mime.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

enum MediaSource { gallery, camera, document }

/// A file already uploaded to the workspace's `chat-media` bucket and ready to
/// be handed to the send endpoint as `media_url`.
class UploadedMedia {
  const UploadedMedia(
      {required this.url, required this.kind, required this.fileName});
  final String url;

  /// Value for `message_type`: image | video | audio | document.
  final String kind;
  final String fileName;
}

/// Meta's per-kind caps (apps/web upload-media.ts mirrors them). Checked
/// BEFORE upload so a file Meta would reject never lands in storage.
const _maxBytes = {
  'image': 5 * 1024 * 1024,
  'video': 16 * 1024 * 1024,
  'audio': 16 * 1024 * 1024,
  'document': 16 * 1024 * 1024,
};

String kindForMime(String mime) {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

/// `account-<id>/<ts>-<base>.<ext>` — the FIRST segment is what the bucket's
/// RLS write policy matches on, so a hand-rolled path is silently rejected.
/// Same rule as `buildMediaPath()` in apps/web/src/lib/storage/upload-media.ts.
String buildMediaPath(String accountId, String fileName, {int? now}) {
  final hasExt = RegExp(r'\.[^.]+$').hasMatch(fileName);
  final ext = hasExt ? fileName.split('.').last.toLowerCase() : 'bin';
  var base = fileName
      .replaceAll(RegExp(r'\.[^.]+$'), '')
      .replaceAll(RegExp(r'[^a-zA-Z0-9_-]+'), '_');
  if (base.length > 40) base = base.substring(0, 40);
  if (base.isEmpty) base = 'file';
  return 'account-$accountId/${now ?? DateTime.now().millisecondsSinceEpoch}-$base.$ext';
}

/// Lets the user pick a file, validates it, and uploads it. Returns null when
/// they cancel. The workspace is PASSED IN (never resolved here): it decides
/// which folder the file is written into.
Future<UploadedMedia?> pickAndUploadMedia(
    MediaSource source, String accountId) async {
  late final String path;
  late final String name;
  switch (source) {
    case MediaSource.gallery:
    case MediaSource.camera:
      final f = await ImagePicker().pickImage(
        source: source == MediaSource.camera
            ? ImageSource.camera
            : ImageSource.gallery,
        imageQuality: 85,
        maxWidth: 2048,
      );
      if (f == null) return null;
      path = f.path;
      name = f.name;
    case MediaSource.document:
      final r = await FilePicker.pickFiles();
      final f = r.isEmpty ? null : r.first;
      if (f == null || f.path == null) return null;
      path = f.path!;
      name = f.name;
  }

  final file = File(path);
  final mime = lookupMimeType(name) ?? 'application/octet-stream';
  final kind = kindForMime(mime);
  final size = await file.length();
  final cap = _maxBytes[kind]!;
  if (size > cap) {
    throw 'That file is ${(size / 1048576).toStringAsFixed(1)} MB; '
        '${kind == 'image' ? 'images' : 'this type'} can be at most ${cap ~/ 1048576} MB.';
  }

  final storage = Supabase.instance.client.storage.from('chat-media');
  final objectPath = buildMediaPath(accountId, name);
  await storage.upload(objectPath, file,
      fileOptions: FileOptions(contentType: mime, cacheControl: '3600'));
  return UploadedMedia(
      url: storage.getPublicUrl(objectPath), kind: kind, fileName: name);
}
