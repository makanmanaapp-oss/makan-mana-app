import '../../models/place_summary.dart';

/// Phase 2.3C — status ketersediaan BERASAS BUKTI (satu sumber kebenaran UI).
///
/// "Open now" HANYA bila waktu operasi disahkan (tiada isyarat hours_unverified)
/// DAN tempat buka. Jika waktu tidak disahkan → status neutral "Hours not
/// verified" — TIDAK PERNAH "Open now". Ini menghalang percanggahan
/// "Open now" + "Opening hours are not verified" pada kad yang sama.
enum AvailabilityDisplay { openNow, closedNow, hoursNotVerified }

/// Tentukan paparan status dari bukti tempat.
AvailabilityDisplay availabilityDisplay(PlaceSummary p) {
  if (p.negativeSignals.contains('hours_unverified')) {
    return AvailabilityDisplay.hoursNotVerified;
  }
  return p.isOpen ? AvailabilityDisplay.openNow : AvailabilityDisplay.closedNow;
}

/// Kunci l10n untuk status ketersediaan.
String availabilityLabelKey(PlaceSummary p) {
  switch (availabilityDisplay(p)) {
    case AvailabilityDisplay.openNow:
      return 'openNow';
    case AvailabilityDisplay.closedNow:
      return 'closedNow';
    case AvailabilityDisplay.hoursNotVerified:
      return 'openStatusUnknown';
  }
}

/// true hanya bila selamat memaparkan sebagai "buka" (hijau) — bukti disahkan + buka.
bool showsOpenNow(PlaceSummary p) =>
    availabilityDisplay(p) == AvailabilityDisplay.openNow;
