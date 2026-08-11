/// PART 1 Phase 1.12 — penyesuai resolusi alias sisi klien.
///
/// Cermin tepat bagi `resolveCanonicalPlaceId` backend: rantaian terbatas,
/// alias bulat gagal selamat, alias tidak diketahui memulangkan `notFound`
/// yang eksplisit (yang menyebabkan pembaca dwi-mod jatuh balik ke legasi).
///
/// TIADA sambungan rangkaian. Peta alias disuntik.
library;

/// Had hop yang sama seperti backend (`MAX_ALIAS_HOPS`).
const int kMaxAliasHops = 16;

enum AliasResolutionStatus { resolved, notFound, circular }

class AliasResolution {
  const AliasResolution({
    required this.status,
    this.canonicalPlaceId,
    this.hops = 0,
  });

  final AliasResolutionStatus status;
  final String? canonicalPlaceId;
  final int hops;

  bool get isResolved => status == AliasResolutionStatus.resolved;
}

/// Penyelesai alias dalam-ingatan.
class AliasResolver {
  AliasResolver({Map<String, String>? aliasMap, this.maxHops = kMaxAliasHops})
      : _aliasMap = aliasMap ?? <String, String>{};

  final Map<String, String> _aliasMap;
  final int maxHops;

  /// Tambah pemetaan alias → canonical.
  void put(String legacyId, String canonicalPlaceId) {
    _aliasMap[legacyId] = canonicalPlaceId;
  }

  /// Buang pemetaan (mensimulasikan rollback: ID kembali kepada `notFound`).
  void remove(String legacyId) => _aliasMap.remove(legacyId);

  void clear() => _aliasMap.clear();

  int get length => _aliasMap.length;

  /// Selesaikan satu ID. Peraturannya sepadan dengan backend:
  /// - ID yang SUDAH canonical (nilai sasaran) memulangkan dirinya;
  /// - alias legasi diselesaikan melalui rantaian terbatas;
  /// - gelung memulangkan `circular`, bukan berputar selamanya;
  /// - tidak dikenali memulangkan `notFound` — TIDAK PERNAH menebak.
  AliasResolution resolve(String aliasId) {
    if (!_aliasMap.containsKey(aliasId)) {
      if (_aliasMap.values.contains(aliasId)) {
        return AliasResolution(
          status: AliasResolutionStatus.resolved,
          canonicalPlaceId: aliasId,
        );
      }
      return const AliasResolution(status: AliasResolutionStatus.notFound);
    }

    final visited = <String>{};
    var current = aliasId;
    var hops = 0;
    while (_aliasMap.containsKey(current)) {
      if (!visited.add(current)) {
        return AliasResolution(status: AliasResolutionStatus.circular, hops: hops);
      }
      current = _aliasMap[current]!;
      hops++;
      if (hops > maxHops) {
        return AliasResolution(status: AliasResolutionStatus.circular, hops: hops);
      }
    }
    return AliasResolution(
      status: AliasResolutionStatus.resolved,
      canonicalPlaceId: current,
      hops: hops,
    );
  }
}
