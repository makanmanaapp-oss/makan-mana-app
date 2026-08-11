/// Social Prompt 9: logik kebolehbacaan siaran (CERMIN rules Firestore).
///
/// Fungsi tulen supaya boleh diuji unit dan diguna untuk tapisan client
/// yang SELARI dengan `canReadPostData` dalam firestore.rules. Rules
/// kekal penguat kuasa sebenar; ini elak papar kandungan yang rules
/// akan tolak (UX bersih) dan dokumentasikan dasar keterlihatan.
library;

/// Konteks penonton semasa (untuk keputusan keterlihatan).
class ViewerContext {
  const ViewerContext({
    required this.uid,
    this.memberGroupIds = const {},
    this.followingAuthorIds = const {},
  });

  final String uid;

  /// ID grup yang penonton sertai (untuk group_only).
  final Set<String> memberGroupIds;

  /// ID pengarang yang penonton ikut (untuk followers_only).
  final Set<String> followingAuthorIds;
}

/// Bolehkah [viewer] baca [post]?
///
/// Selari `canReadPostData` di rules:
/// - pemilik: sentiasa.
/// - deleted/hidden: pemilik sahaja.
/// - legacy type=='auto': pemilik sahaja (privasi lama).
/// - private: pemilik sahaja.
/// - group_only: ahli grup.
/// - followers_only: pemilik SAHAJA (SP9.2B: dimatikan untuk beta →
///   owner-only, setara private; audience-map ditangguh selepas beta).
/// - public/unlisted: sesiapa log masuk.
bool canReadPost(Map<String, dynamic> post, ViewerContext viewer) {
  if (viewer.uid.isEmpty) return false;
  final author = post['authorUid'] as String? ?? '';
  final isOwner = author == viewer.uid;
  if (isOwner) return true;

  // Bukan pemilik: dinding untuk kandungan tersembunyi/lama.
  final status = post['status'] as String?;
  if (status == 'deleted' || status == 'hidden') return false;
  if (post['type'] == 'auto') return false;

  switch (post['visibility'] as String? ?? 'public') {
    case 'group_only':
      final groupId = post['groupId'] as String? ?? '';
      return groupId.isNotEmpty && viewer.memberGroupIds.contains(groupId);
    case 'public':
    case 'unlisted':
      return true;
    default: // private, followers_only (beta), nilai tak dikenal → sekat
      return false;
  }
}

/// SP9.2B: keterlihatan yang boleh dipilih pengguna untuk siaran BARU
/// (composer normal). followers_only & unlisted DIBUANG untuk beta.
const composerVisibilityOptions = <String>['public', 'private'];
