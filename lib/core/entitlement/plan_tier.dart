/// Peringkat pelan MakanMana (Prompt 10). Sumber durable = users/{uid}.plan;
/// sumber runtime = MakanManaUserContext.plan. Pelan tidak sah/hilang = free.
enum PlanTier {
  free,
  plus,
  pro;

  /// Normalisasi rentetan pelan (lowercase, selamat) -> PlanTier.
  static PlanTier parse(String? raw) {
    switch (raw?.trim().toLowerCase()) {
      case 'plus':
        return PlanTier.plus;
      case 'pro':
        return PlanTier.pro;
      default:
        return PlanTier.free; // unknown/missing -> free
    }
  }

  /// Kedudukan hierarki: free(0) < plus(1) < pro(2).
  int get rank => index;

  /// true jika pelan ini >= [required].
  bool atLeast(PlanTier required) => rank >= required.rank;

  String get id => name; // 'free' | 'plus' | 'pro'

  String get priceLabel {
    switch (this) {
      case PlanTier.free:
        return 'RM0';
      case PlanTier.plus:
        return 'RM9.99';
      case PlanTier.pro:
        return 'RM29.90';
    }
  }
}
