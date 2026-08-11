/// Social Prompt 3: helper media post.
///
/// Model post semasa hanya ada SATU `imageUrl`, tetapi viewer distruktur
/// atas senarai supaya multi-media (medan `imageUrls`) terus disokong
/// tanpa ubah viewer bila composer multi-gambar tiba.
library;

/// Senarai URL media sesebuah post, tersusun untuk PageView.
/// - `imageUrls` (List) diguna jika wujud dan tidak kosong.
/// - Jika tidak, fallback kepada `imageUrl` tunggal.
/// - URL kosong/bukan-http dibuang; tiada media = senarai kosong.
List<String> postMediaUrls(Map<String, dynamic> data) {
  final multi = data['imageUrls'];
  if (multi is List) {
    final urls = multi
        .whereType<String>()
        .map((u) => u.trim())
        .where(_looksLikeUrl)
        .toList();
    if (urls.isNotEmpty) return urls;
  }
  final single = data['imageUrl'];
  if (single is String && _looksLikeUrl(single.trim())) {
    return [single.trim()];
  }
  return const [];
}

bool _looksLikeUrl(String u) =>
    u.isNotEmpty && (u.startsWith('http://') || u.startsWith('https://'));

/// Tag Hero unik per gambar post (dipadan antara kad feed dan viewer).
String postMediaHeroTag(String postId, int index) =>
    'post_media_${postId}_$index';

/// Teks kongsi OS share sheet (dikongsi PostCard + media viewer supaya
/// kelakuan konsisten). Bukan "repost" — tiada dokumen dicipta.
String buildShareText(Map<String, dynamic> data) {
  final name = data['displayName'] as String? ?? 'Foodie';
  final text = data['text'] as String? ?? '';
  final placeName = data['placeName'] as String?;
  final body = text.isNotEmpty
      ? '"$text" — $name'
      : '$name makan kat ${placeName ?? 'tempat best'} 😋';
  return '$body\n\n🍽️ Dari MakanMana';
}

/// Metadata event interaksi post — TIADA data peribadi mentah, hanya
/// pengecam post + konteks paparan (selaras EventLogger._sanitize).
Map<String, dynamic> postEventMetadata(
  String postId,
  Map<String, dynamic> data, {
  String? sourceScreen,
  int? mediaIndex,
}) =>
    {
      'postId': postId,
      if (data['authorUid'] is String) 'postOwnerId': data['authorUid'],
      if (data['postType'] is String) 'postType': data['postType'],
      if (data['visibility'] is String) 'visibility': data['visibility'],
      if (sourceScreen != null) 'sourceScreen': sourceScreen,
      if (mediaIndex != null) 'mediaIndex': mediaIndex,
    };
