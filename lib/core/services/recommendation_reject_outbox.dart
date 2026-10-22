import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

/// One unresolved reject per signed-in account. A new recommendation is blocked
/// until it has reached the server. Keys never cross account boundaries.
class RecommendationRejectOutbox {
  RecommendationRejectOutbox(this.preferences, this.userId);

  final SharedPreferences preferences;
  final String userId;
  String get key => 'mm.pending_recommendation_reject.$userId';

  Map<String, dynamic>? get pending {
    final raw = preferences.getString(key);
    if (raw == null) return null;
    return Map<String, dynamic>.from(jsonDecode(raw) as Map);
  }

  Future<bool> save(Map<String, dynamic> intent) async {
    final existing = pending;
    if (existing != null && existing['actionId'] != intent['actionId']) {
      return false;
    }
    return preferences.setString(key, jsonEncode(intent));
  }

  Future<bool> clearIfAction(String actionId) async {
    if (pending?['actionId'] != actionId) return false;
    return preferences.remove(key);
  }
}
