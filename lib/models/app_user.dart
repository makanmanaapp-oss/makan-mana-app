class AppUser {
  const AppUser({
    required this.uid,
    required this.email,
    this.displayName,
    this.photoUrl,
    this.language = 'ms',
    this.plan = 'free',
    this.planStatus = 'active',
  });

  final String uid;
  final String email;
  final String? displayName;
  final String? photoUrl;
  final String language; // ms | en | zh | ta
  final String plan; // free | plus | pro
  final String planStatus; // active | expired | cancelled | trial

  Map<String, dynamic> toMap() => {
        'uid': uid,
        'email': email,
        'displayName': displayName,
        'photoUrl': photoUrl,
        'language': language,
        'plan': plan,
        'planStatus': planStatus,
      };

  factory AppUser.fromMap(Map<String, dynamic> map) => AppUser(
        uid: map['uid'] as String,
        email: map['email'] as String? ?? '',
        displayName: map['displayName'] as String?,
        photoUrl: map['photoUrl'] as String?,
        language: map['language'] as String? ?? 'ms',
        plan: map['plan'] as String? ?? 'free',
        planStatus: map['planStatus'] as String? ?? 'active',
      );
}
