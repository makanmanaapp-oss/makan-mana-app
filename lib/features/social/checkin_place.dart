import 'package:url_launcher/url_launcher.dart';

/// Nilai tempat yang dipilih untuk check-in. Ini ialah snapshot paparan;
/// pelayan tetap menyelesaikan semula tempat yang disahkan sebelum menyimpan.
class CheckinPlace {
  const CheckinPlace({
    required this.name,
    required this.provider,
    this.placeId,
    this.providerPlaceId,
    this.areaLabel = '',
    this.address = '',
    this.lat,
    this.lng,
    this.source = 'manual',
    this.verified = false,
    this.isManual = false,
  });

  final String? placeId;
  final String? providerPlaceId;
  final String provider;
  final String name;
  final String areaLabel;
  final String address;
  final double? lat;
  final double? lng;
  final String source;
  final bool verified;
  final bool isManual;

  factory CheckinPlace.fromMap(Map<Object?, Object?> raw) {
    final map = Map<String, dynamic>.from(raw);
    double? number(String key) => (map[key] as num?)?.toDouble();
    return CheckinPlace(
      placeId: map['placeId'] as String?,
      providerPlaceId: map['providerPlaceId'] as String?,
      provider: map['provider'] as String? ?? 'google',
      name: map['name'] as String? ?? '',
      areaLabel: map['areaLabel'] as String? ?? '',
      address: map['address'] as String? ?? '',
      lat: number('lat'),
      lng: number('lng'),
      source: map['source'] as String? ?? 'google_places',
      verified: map['verified'] == true,
      isManual: map['isManual'] == true,
    );
  }

  factory CheckinPlace.manual(String name, {String areaLabel = ''}) =>
      CheckinPlace(
        name: name.trim(),
        areaLabel: areaLabel.trim(),
        provider: 'manual',
        source: 'manual',
        isManual: true,
      );

  Map<String, dynamic> toWire() => {
        'placeId': placeId,
        'providerPlaceId': providerPlaceId,
        'provider': provider,
        'name': name,
        'areaLabel': areaLabel,
        'address': address,
        'lat': lat,
        'lng': lng,
        'source': source,
        'verified': verified,
        'isManual': isManual,
      };
}

Future<void> openCheckinPlaceInMaps(CheckinPlace place) async {
  final query = Uri.encodeComponent('${place.name} ${place.address}'.trim());
  final id = place.providerPlaceId;
  final idParam = id == null || id.isEmpty ? '' : '&query_place_id=$id';
  await launchUrl(
    Uri.parse('https://www.google.com/maps/search/?api=1&query=$query$idParam'),
    mode: LaunchMode.externalApplication,
  );
}
