import 'package:cloud_firestore/cloud_firestore.dart' show Timestamp;
import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:makan_mana/app/theme.dart';
import 'package:makan_mana/app/localization/app_localizations.dart';
import 'package:makan_mana/core/constants/plan_constants.dart';
import 'package:makan_mana/core/providers.dart' show themeModeFromPref;
import 'package:makan_mana/core/services/dummy_suggestion_service.dart';
import 'package:makan_mana/core/utils/time_slot_utils.dart';
import 'package:makan_mana/core/widgets/makan_avatar.dart';
import 'package:makan_mana/features/auth/auth_bootstrap.dart';
import 'package:makan_mana/features/auth/auth_error_messages.dart';
import 'package:makan_mana/features/auth/login_screen.dart'
    show kGoogleSignInConfigured, kPhoneAuthConfigured;
import 'package:makan_mana/features/auth/phone_validation.dart';
import 'package:makan_mana/features/auth/register_validation.dart';
import 'package:makan_mana/features/paywall/coupon_status.dart';
import 'package:makan_mana/features/dm/dm_service.dart';
import 'package:makan_mana/features/groups/bill_attach.dart';
import 'package:makan_mana/features/groups/group_activity.dart';
import 'package:makan_mana/features/social/checkin_utils.dart';
import 'package:makan_mana/features/social/food_profile.dart';
import 'package:makan_mana/features/social/post_media.dart';
import 'package:makan_mana/features/social/post_visibility_rules.dart';
import 'package:makan_mana/features/social/public_profile_auto.dart';
import 'package:makan_mana/features/social/repost.dart';
import 'package:makan_mana/models/app_user.dart';
import 'package:makan_mana/models/daily_usage.dart';
import 'package:makan_mana/repositories/user_repository.dart';

void main() {
  test('dummy suggestion service memberi cadangan', () {
    final service = DummySuggestionService();
    expect(DummySuggestionService.places, isNotEmpty);
    expect(service.heroPick().isOpen, isTrue);
    expect(service.nearby(), isNotEmpty);
    expect(service.randomPick().matchScore, greaterThan(0));
  });

  test('time slot mengikut jam', () {
    expect(TimeSlotUtils.forHour(7), 'breakfast');
    expect(TimeSlotUtils.forHour(12), 'lunch');
    expect(TimeSlotUtils.forHour(16), 'tea');
    expect(TimeSlotUtils.forHour(20), 'dinner');
    expect(TimeSlotUtils.forHour(23), 'supper');
    expect(TimeSlotUtils.forHour(2), 'supper');
    expect(TimeSlotUtils.dateKey(DateTime(2026, 7, 5)), '20260705');
  });

  test('had spin percuma 3 sehari', () {
    const fresh = DailyUsage(userId: 'u1', date: '20260705', plan: 'free');
    expect(fresh.canSpin, isTrue);
    expect(fresh.spinLeft, 3);

    const habis = DailyUsage(
        userId: 'u1', date: '20260705', plan: 'free', spinUsed: 3);
    expect(habis.canSpin, isFalse);
    expect(habis.spinLeft, 0);

    const plus = DailyUsage(
        userId: 'u1', date: '20260705', plan: 'plus', spinLimit: -1, spinUsed: 99);
    expect(plus.canSpin, isTrue);
    expect(plus.unlimited, isTrue);
  });

  // QUOTA-01: had Free mesti 3 walaupun dalam build debug/test —
  // bypass debug 999 lama menyebabkan kuota tidak dikuatkuasa.
  test('had free sama dalam debug dan release', () {
    expect(PlanConstants.freeSpinLimitPerDay, 3);
    expect(PlanConstants.effectiveFreeSpinLimit, 3);
  });

  // PAY-01: mock upgrade dev mesti kekal OFF secara lalai.
  test('mock upgrade dev dimatikan secara lalai', () {
    expect(PlanConstants.devMockUpgradeEnabled, isFalse);
  });

  // QUOTA-01: spin ke-4 Free diblok (spinUsed 3/3).
  test('spin keempat free diblok', () {
    const used3 = DailyUsage(
        userId: 'u1', date: '20260705', plan: 'free', spinUsed: 3);
    expect(used3.canSpin, isFalse);
    expect(used3.spinLeft, 0);
  });

  // SP2.1: teks bajet mesti julat RM sah — bukan nama makanan/masakan.
  test('validBudgetText tolak teks bukan bajet', () {
    expect(validBudgetText('RM10–RM20'), 'RM10–RM20');
    expect(validBudgetText('rm5 - rm15'), 'rm5 - rm15');
    expect(validBudgetText('Nasi Lemak RendanMamakg'), isNull);
    expect(validBudgetText('Mamak'), isNull);
    expect(validBudgetText('thai'), isNull);
    expect(validBudgetText('RM0'), isNull);
    expect(validBudgetText(''), isNull);
    expect(validBudgetText('10-20'), isNull, reason: 'tiada RM');
  });

  // SP2.1: bio auto tidak boleh campurkan makanan ke dalam ayat bajet.
  test('bio auto tidak guna makanan sebagai bajet', () {
    final l = AppLocalizations(const Locale('ms'));
    const junkBudget = FoodProfile(
      uid: 'u1',
      displayName: 'Tester',
      foodMood: 'Pedas power 🌶️',
      favouriteCuisine: 'melayu, jepun, thai',
      budgetRange: 'Nasi Lemak RendanMamakg',
      showBudget: true,
    );
    final bio = buildAutoFoodBio(l, junkBudget);
    expect(bio.contains('Nasi Lemak RendanMamakg'), isFalse);
    expect(bio, contains('Suka makanan pedas'));
    expect(bio, contains('Melayu, Jepun dan Thai'));

    const validBudget = FoodProfile(
      uid: 'u1',
      displayName: 'Tester',
      budgetRange: 'RM10–RM20',
      showBudget: true,
    );
    expect(buildAutoFoodBio(l, validBudget),
        contains('Bajet biasa sekitar RM10–RM20'));

    const hidden = FoodProfile(
      uid: 'u1',
      displayName: 'Tester',
      budgetRange: 'RM10–RM20',
    );
    expect(buildAutoFoodBio(l, hidden).contains('RM10'), isFalse,
        reason: 'showBudget=false: bajet tidak didedahkan');

    const empty = FoodProfile(uid: 'u1', displayName: 'Tester');
    expect(buildAutoFoodBio(l, empty), isEmpty);
  });

  // SP3: senarai media post — imageUrl tunggal hari ini, imageUrls
  // (multi) disokong untuk masa depan; URL rosak/kosong dibuang.
  test('postMediaUrls kendali single, multi dan kosong', () {
    expect(postMediaUrls({'imageUrl': 'https://x.com/a.jpg'}),
        ['https://x.com/a.jpg']);
    expect(
        postMediaUrls({
          'imageUrls': ['https://x.com/1.jpg', 'https://x.com/2.jpg'],
          'imageUrl': 'https://x.com/a.jpg',
        }),
        ['https://x.com/1.jpg', 'https://x.com/2.jpg'],
        reason: 'imageUrls diutamakan bila wujud');
    expect(postMediaUrls({'imageUrl': ''}), isEmpty);
    expect(postMediaUrls({}), isEmpty);
    expect(postMediaUrls({'imageUrl': 'bukan-url'}), isEmpty);
    expect(postMediaUrls({'imageUrls': <String>[], 'imageUrl': null}),
        isEmpty);
  });

  // SP3: metadata event post tiada data peribadi mentah + teks kongsi.
  test('postEventMetadata dan buildShareText selamat', () {
    final meta = postEventMetadata(
      'p1',
      {'authorUid': 'u9', 'postType': 'food_post', 'visibility': 'public'},
      sourceScreen: 'feed',
      mediaIndex: 0,
    );
    expect(meta['postId'], 'p1');
    expect(meta['postOwnerId'], 'u9');
    expect(meta['visibility'], 'public');
    expect(meta.containsKey('text'), isFalse,
        reason: 'kandungan post tidak dilog');

    expect(buildShareText({'displayName': 'Mat', 'text': 'Sedap!'}),
        contains('"Sedap!" — Mat'));
    expect(buildShareText({'displayName': 'Mat', 'placeName': 'Warung Ali'}),
        contains('Warung Ali'));
  });

  // SP4: input belanja check-in mesti nombor RM sah — bukan teks makanan.
  test('parseSpendInput sah dan tolak input rosak', () {
    expect(parseSpendInput('12'), 12.0);
    expect(parseSpendInput('12.50'), 12.5);
    expect(parseSpendInput('12,50'), 12.5);
    expect(parseSpendInput('RM12.50'), 12.5);
    expect(parseSpendInput('rm 8'), 8.0);
    expect(parseSpendInput('0'), 0.0);
    expect(parseSpendInput(''), isNull);
    expect(parseSpendInput('nasi lemak'), isNull);
    expect(parseSpendInput('nasi 12'), isNull);
    expect(parseSpendInput('-5'), isNull);
    expect(parseSpendInput('12.505'), isNull, reason: 'maks 2 titik');
    expect(parseSpendInput('100000'), isNull, reason: 'melebihi had');
  });

  // SP4: baris ringkasan kad check-in kompak dan langkau medan kosong.
  test('checkinSummaryLine dan formatSpend', () {
    expect(formatSpend(12), 'RM12');
    expect(formatSpend(12.5), 'RM12.50');
    expect(
        checkinSummaryLine({
          'menuName': 'Nasi lemak',
          'totalSpend': 12.5,
          'userRating': 4,
        }),
        '🍛 Nasi lemak · RM12.50 · ⭐ 4/5');
    expect(checkinSummaryLine({'userRating': 5}), '⭐ 5/5');
    expect(checkinSummaryLine({'userRating': 9}), '',
        reason: 'rating luar julat tidak dipapar');
    expect(checkinSummaryLine(const {}), '');
  });

  // SP5: stats grup dikira dari data sebenar sahaja — tiada kiraan palsu.
  test('computeGroupStats kira undian aktif, bil belum selesai, snippet',
      () {
    final stats = computeGroupStats(
      polls: [
        {'status': 'open'},
        {'status': 'open'},
        {'status': 'closed'},
      ],
      bills: [
        {'status': 'settled'},
        {'status': 'active'},
        {'status': null},
      ],
      posts: [
        {
          'type': 'checkin',
          'displayName': 'Aina',
          'placeName': 'Warung Tepi Sawah',
        },
      ],
    );
    expect(stats.activePollCount, 2);
    expect(stats.unpaidBillCount, 2);
    // W2: snippet aktiviti tanpa emoji sistem (spec Bright Mode).
    expect(stats.latestActivityText, 'Aina · Warung Tepi Sawah');

    final empty =
        computeGroupStats(polls: const [], bills: const [], posts: const []);
    expect(empty.activePollCount, 0);
    expect(empty.unpaidBillCount, 0);
    expect(empty.latestActivityText, '');

    // Post dipadam tidak dikira sebagai aktiviti.
    final deleted = computeGroupStats(polls: const [], bills: const [], posts: [
      {'status': 'deleted', 'displayName': 'X', 'text': 'padam'},
    ]);
    expect(deleted.latestActivityText, '');
  });

  // SP6: ringkasan bil di feed — KIRAAN sahaja, tiada nama penghutang.
  test('billPaidCounts dan billSummaryLine selamat-feed', () {
    final bill = {
      'totalAmount': 86.5,
      'participants': [
        {'name': 'A', 'paymentStatus': 'paid'},
        {'name': 'B', 'paymentStatus': 'waived'},
        {'name': 'C', 'paymentStatus': 'unpaid'},
        {'name': 'D', 'paymentStatus': 'pending_confirmation'},
      ],
    };
    expect(billPaidCounts(bill), (2, 4));
    final line = billSummaryLine(bill, 'dah bayar');
    expect(line, 'RM86.50 · 2/4 dah bayar');
    expect(line.contains('A'), isFalse,
        reason: 'tiada nama peserta dalam ringkasan feed');

    expect(billSummaryLine({'totalAmount': 20}, 'dah bayar'), 'RM20.00');
    expect(billPaidCounts(const {}), (0, 0));
  });

  // SP7: threadId DM deterministik + snippet inbox selamat.
  test('dmThreadId deterministik dan dmSnippet dipotong', () {
    expect(dmThreadId('uidB', 'uidA'), 'uidA_uidB');
    expect(dmThreadId('uidA', 'uidB'), 'uidA_uidB',
        reason: 'susunan input tidak mengubah threadId');
    expect(dmOtherUid(['uidA', 'uidB'], 'uidA'), 'uidB');
    expect(dmOtherUid(['uidA', 'uidB'], 'uidX'), 'uidA');
    expect(dmOtherUid(const [], 'uidA'), '');

    expect(dmSnippet('  hello\nworld  '), 'hello world');
    final long = 'a' * 200;
    final snip = dmSnippet(long);
    expect(snip.length, 81);
    expect(snip.endsWith('…'), isTrue);
  });

  // NET-01: calon fallback offline mesti dianggap sample (label + tiada
  // pembelajaran sebenar).
  test('offline fallback dilabel sample', () {
    final place = DummySuggestionService.places.first
        .copyWithSource('offline_fallback');
    expect(place.isSample, isTrue);
    expect(place.isOfflineFallback, isTrue);
    expect(DummySuggestionService.places.first.isSample, isFalse,
        reason: 'tempat asal tanpa source tidak dilabel');
  });

  // SP7.2: pemetaan ralat auth mesra pengguna (tiada mesej mentah Firebase).
  test('authErrorKey memetakan kod FirebaseAuth ke kunci l10n', () {
    expect(authErrorKey('wrong-password'), 'authErrWrongPassword');
    expect(authErrorKey('invalid-credential'), 'authErrWrongPassword',
        reason: 'kod baharu Firebase utk password salah / provider lain');
    expect(authErrorKey('INVALID_LOGIN_CREDENTIALS'), 'authErrWrongPassword');
    expect(authErrorKey('user-not-found'), 'authErrUserNotFound');
    expect(authErrorKey('invalid-email'), 'authErrInvalidEmail');
    expect(authErrorKey('user-disabled'), 'authErrUserDisabled');
    expect(authErrorKey('network-request-failed'), 'authErrNetwork');
    expect(authErrorKey('email-already-in-use'), 'authErrEmailInUse');
    expect(authErrorKey('weak-password'), 'authErrWeakPassword');
    expect(authErrorKey('too-many-requests'), 'authErrTooMany');
    expect(authErrorKey('kod-pelik-entah-apa'), 'authError',
        reason: 'fallback generik, bukan mesej mentah');

    // Kunci wujud dalam SEMUA bahasa (tiada crash l10n).
    for (final lang in ['ms', 'en', 'zh', 'ta']) {
      final l = AppLocalizations(Locale(lang));
      for (final key in [
        'authErrWrongPassword',
        'authErrUserNotFound',
        'authErrInvalidEmail',
        'authErrUserDisabled',
        'authErrNetwork',
        'authErrEmailInUse',
        'authErrWeakPassword',
        'authErrTooMany',
      ]) {
        expect(l.t(key), isNot(key),
            reason: '$key mesti ada terjemahan $lang');
      }
    }
    // SP10.3: ayat Google DIBUANG dari mesej (Google dimatikan —
    // jangan kelirukan pengguna). Spec 7.2 lama di-override.
    expect(AppLocalizations(const Locale('ms')).t('authErrWrongPassword'),
        isNot(contains('Google')));
  });

  // SP8: privasi repost — kekang keterlihatan hasil ikut post asal.
  test('checkRepostability menguatkuasa privasi', () {
    // Public → boleh (SP9.2B: hasil public/private sahaja).
    final pub = checkRepostability({'visibility': 'public'},
        isGroupMember: false);
    expect(pub.allowed, isTrue);
    expect(pub.allowedVisibilities, containsAll(['public', 'private']));

    // SP9.2B: followers_only DIMATIKAN → repost/quote disekat.
    final fol = checkRepostability({'visibility': 'followers_only'},
        isGroupMember: false);
    expect(fol.allowed, isFalse);

    // public → hasil tak pernah followers_only (public/private sahaja).
    expect(pub.allowedVisibilities.contains('followers_only'), isFalse);

    // private → sekat sepenuhnya.
    expect(
        checkRepostability({'visibility': 'private'}, isGroupMember: false)
            .allowed,
        isFalse);

    // deleted/hidden → tidak tersedia.
    expect(
        checkRepostability(
                {'visibility': 'public', 'status': 'deleted'},
                isGroupMember: false)
            .allowed,
        isFalse);

    // group_only + ahli → hanya group_only; bukan ahli → sekat.
    final grpMember = checkRepostability(
        {'visibility': 'group_only', 'groupId': 'g1'},
        isGroupMember: true);
    expect(grpMember.allowed, isTrue);
    expect(grpMember.allowedVisibilities, ['group_only']);
    expect(
        checkRepostability(
                {'visibility': 'group_only', 'groupId': 'g1'},
                isGroupMember: false)
            .allowed,
        isFalse);

    // Nilai tak dikenal → selamat: sekat.
    expect(
        checkRepostability({'visibility': 'pelik'}, isGroupMember: false)
            .allowed,
        isFalse);
  });

  // SP8: repost biasa dihala ke post AKAR (elak rantaian repost).
  test('repostTargetId hala ke akar', () {
    expect(repostTargetId('p2', {'postType': 'repost', 'repostOfPostId': 'p1'}),
        'p1');
    expect(repostTargetId('p1', {'postType': 'food_post'}), 'p1');
    // Quote bukan repost biasa → sasaran sendiri.
    expect(
        repostTargetId('q1', {'postType': 'quote_repost', 'quotedPostId': 'p1'}),
        'q1');
  });

  // SP8: postMediaUrls sokong imageUrls[] (multi) + fallback imageUrl.
  test('postMediaUrls kendali multi-gambar', () {
    expect(
        postMediaUrls({
          'imageUrls': ['https://a/1.jpg', 'https://a/2.jpg']
        }),
        ['https://a/1.jpg', 'https://a/2.jpg']);
    // imageUrls kosong → fallback imageUrl tunggal.
    expect(postMediaUrls({'imageUrls': [], 'imageUrl': 'https://a/x.jpg'}),
        ['https://a/x.jpg']);
    // l10n kunci SP8 wujud semua bahasa.
    for (final lang in ['ms', 'en', 'zh', 'ta']) {
      final l = AppLocalizations(Locale(lang));
      for (final key in [
        'repostAction',
        'quoteAction',
        'postUnavailable',
        'cannotRepost',
        'multiImageLimit',
        'imageUploadFailed',
      ]) {
        expect(l.t(key), isNot(key), reason: '$key perlu $lang');
      }
    }
  });

  // SP9: canReadPost cermin rules Firestore — privasi keterlihatan.
  test('canReadPost menguatkuasa keterlihatan (cermin rules)', () {
    const owner = ViewerContext(uid: 'A');
    const stranger = ViewerContext(uid: 'B');
    const member = ViewerContext(uid: 'B', memberGroupIds: {'g1'});
    const follower = ViewerContext(uid: 'B', followingAuthorIds: {'A'});

    Map<String, dynamic> post(String vis, {String? group, String? status,
        String? type}) => {
          'authorUid': 'A',
          'visibility': vis,
          if (group != null) 'groupId': group,
          if (status != null) 'status': status,
          if (type != null) 'type': type,
        };

    // public: sesiapa; pemilik sentiasa.
    expect(canReadPost(post('public'), stranger), isTrue);
    expect(canReadPost(post('unlisted'), stranger), isTrue);

    // private: pemilik sahaja.
    expect(canReadPost(post('private'), owner), isTrue);
    expect(canReadPost(post('private'), stranger), isFalse);

    // group_only: ahli sahaja.
    expect(canReadPost(post('group_only', group: 'g1'), member), isTrue);
    expect(canReadPost(post('group_only', group: 'g1'), stranger), isFalse);
    expect(canReadPost(post('group_only', group: 'g2'), member), isFalse,
        reason: 'ahli grup lain tidak boleh baca');

    // SP9.2B: followers_only DIMATIKAN → owner-only (pengikut pun tak).
    expect(canReadPost(post('followers_only'), owner), isTrue);
    expect(canReadPost(post('followers_only'), follower), isFalse);
    expect(canReadPost(post('followers_only'), stranger), isFalse);
    // composer beta hanya public + private.
    expect(composerVisibilityOptions, ['public', 'private']);

    // deleted/hidden & legacy auto: bukan-pemilik ditolak walau public.
    expect(canReadPost(post('public', status: 'deleted'), stranger), isFalse);
    expect(canReadPost(post('public', status: 'deleted'), owner), isTrue);
    expect(canReadPost(post('public', type: 'auto'), stranger), isFalse);
    expect(canReadPost(post('public', type: 'auto'), owner), isTrue);

    // penonton tanpa uid: tidak boleh baca apa-apa.
    expect(canReadPost(post('public'), const ViewerContext(uid: '')), isFalse);
  });

  // SP10.2: token tema — kad & teks WAJIB kontras (tiada putih-atas-putih).
  test('MMColors token boleh dibaca dua-dua mod', () {
    final dark = MMColors.forBrightness(isDark: true);
    final light = MMColors.forBrightness(isDark: false);

    // Gelap: kad gelap + teks cerah (luminan jauh berbeza).
    expect(dark.card.computeLuminance(), lessThan(0.15),
        reason: 'kad mod gelap mesti gelap');
    expect(dark.onCard.computeLuminance(), greaterThan(0.7),
        reason: 'teks utama mod gelap mesti cerah');
    expect(dark.onCardMuted.computeLuminance(), greaterThan(0.3),
        reason: 'teks sekunder gelap mesti masih jelas (>= #B8B8B8)');

    // Cerah: kad putih + teks gelap.
    expect(light.card.computeLuminance(), greaterThan(0.85),
        reason: 'kad mod cerah kekal putih');
    expect(light.onCard.computeLuminance(), lessThan(0.15),
        reason: 'teks utama mod cerah mesti gelap');

    // Jangan sesekali sama (putih-atas-putih / hitam-atas-hitam).
    expect(dark.card, isNot(dark.onCard));
    expect(light.card, isNot(light.onCard));
    // Aksen identiti kekal (token Bright Mode spec).
    expect(MMColors.danger.toARGB32(), 0xFFE83A32);
    expect(MMColors.accentYellow.toARGB32(), 0xFFF4C542);
  });

  // PROMPT 12: status Pro Trial dari dokumen users (tulen).
  test('couponTrialInfo bezakan trial aktif/tamat/berbayar', () {
    final now = DateTime(2026, 7, 15);
    // Trial aktif (kupon, belum tamat).
    final active = couponTrialInfo({
      'plan': 'pro',
      'planSource': 'coupon',
      'couponExpiresAt': Timestamp.fromDate(DateTime(2026, 8, 14)),
    }, now: now);
    expect(active.isTrial, isTrue);
    expect(active.isActive, isTrue);
    expect(active.isExpired, isFalse);
    expect(active.expiresAt, isNotNull);

    // Trial tamat (kupon, tarikh lepas) → dikira expired walau plan masih pro
    // (sebelum scheduled/refresh betulkan).
    final lapsed = couponTrialInfo({
      'plan': 'pro',
      'planSource': 'coupon',
      'couponExpiresAt': Timestamp.fromDate(DateTime(2026, 7, 1)),
    }, now: now);
    expect(lapsed.isActive, isFalse);
    expect(lapsed.isExpired, isTrue);

    // planSource expired_coupon → bukan trial aktif.
    final expiredSource = couponTrialInfo({
      'plan': 'free',
      'planSource': 'expired_coupon',
    }, now: now);
    expect(expiredSource.isActive, isFalse);
    expect(expiredSource.isExpired, isTrue);

    // Pro BERBAYAR (planSource bukan coupon) → BUKAN trial.
    final paid = couponTrialInfo({
      'plan': 'pro',
      'planSource': 'google_play',
    }, now: now);
    expect(paid.isTrial, isFalse);
    expect(paid.isActive, isFalse);

    // Free biasa / null.
    expect(couponTrialInfo(null).isTrial, isFalse);
    expect(couponTrialInfo({'plan': 'free'}, now: now).isTrial, isFalse);
  });

  test('formatTrialDate BM', () {
    expect(formatTrialDate(DateTime(2026, 8, 14)), '14 Ogos 2026');
    expect(formatTrialDate(DateTime(2026, 3, 1)), '1 Mac 2026');
  });

  // SP10.5: kontras sistemik — SEMUA pasangan token bg/teks mesti
  // berbeza luminan cukup dlm DUA-DUA mod (tiada putih-atas-putih /
  // hitam-atas-hitam di mana-mana skrin yang guna token).
  test('SP10.5 kontras token dua-dua mod mencukupi', () {
    double ratio(Color a, Color b) {
      final la = a.computeLuminance(), lb = b.computeLuminance();
      final hi = la > lb ? la : lb, lo = la > lb ? lb : la;
      return (hi + 0.05) / (lo + 0.05);
    }

    for (final isDark in [true, false]) {
      final mm = MMColors.forBrightness(isDark: isDark);
      final mode = isDark ? 'gelap' : 'cerah';
      // Teks utama atas kad & latar: >= 4.5 (WCAG AA teks kecil).
      expect(ratio(mm.card, mm.onCard), greaterThan(4.5),
          reason: 'onCard atas card mesti jelas ($mode)');
      expect(ratio(mm.appBackground, mm.onCard), greaterThan(4.5),
          reason: 'onCard atas appBackground mesti jelas ($mode)');
      expect(ratio(mm.elevatedCard, mm.onCard), greaterThan(4.0),
          reason: 'onCard atas elevatedCard mesti jelas ($mode)');
      // Teks sekunder: >= 3.0 (masih boleh dibaca, bukan hiasan).
      expect(ratio(mm.card, mm.onCardMuted), greaterThan(3.0),
          reason: 'onCardMuted atas card mesti boleh dibaca ($mode)');
      // Input (fillColor guna card, teks onCard, hint onCardMuted).
      expect(ratio(mm.card, mm.onCardMuted), greaterThan(2.5),
          reason: 'hint input mesti kelihatan ($mode)');
      // Chip tidak dipilih: chipText atas chipBackground.
      expect(ratio(mm.chipBackground, mm.chipText), greaterThan(4.5),
          reason: 'chip tak dipilih mesti jelas ($mode)');
      // DARK MODE ZIP: chip dipilih = kuning #F6D778 + TEKS GELAP
      // #17191D dalam KEDUA-DUA mod (jangan putih-atas-kuning).
      expect(
          ratio(mm.chipSelectedBackground, MMColors.selectedDarkText),
          greaterThan(4.5),
          reason: 'chip dipilih mesti jelas ($mode)');
    }

    // Penyelesai gaya kad: kad PUTIH mesti teks GELAP; kad GELAP mesti
    // teks CERAH (peraturan B-style SP10.5).
    final light = MMColors.forBrightness(isDark: false);
    final dark = MMColors.forBrightness(isDark: true);
    expect(light.onCard.computeLuminance(), lessThan(0.2),
        reason: 'kad putih -> teks gelap');
    expect(dark.onCard.computeLuminance(), greaterThan(0.7),
        reason: 'kad gelap -> teks cerah');
  });

  // SP10: Appearance — pemetaan pref -> ThemeMode.
  test('themeModeFromPref memetakan dengan betul', () {
    expect(themeModeFromPref('light'), ThemeMode.light);
    expect(themeModeFromPref('dark'), ThemeMode.dark);
    expect(themeModeFromPref('system'), ThemeMode.system);
    // BRIGHT MODE spec: lalai = Bright melainkan pengguna pilih sendiri.
    expect(themeModeFromPref(null), ThemeMode.light,
        reason: 'lalai = Bright Mode');
    expect(themeModeFromPref('pelik'), ThemeMode.light);
  });

  // SP10: avatar preset — id sah, fallback deterministik.
  test('avatarPresetOf dan fallback avatar', () {
    expect(avatarPresetOf('sambalBowl')?.emoji, '🍜');
    expect(avatarPresetOf('magicPlate')?.id, 'magicPlate');
    expect(avatarPresetOf('foodieMascot'), isNotNull);
    expect(avatarPresetOf('takWujud'), isNull);
    expect(avatarPresetOf(null), isNull);
    expect(avatarPresetOf(''), isNull);
    expect(kAvatarPresets.length, 3);

    // Deterministik: nama sama = gradient sama.
    expect(fallbackGradientFor('Hachiman'),
        fallbackGradientFor('Hachiman'));
  });

  // SP10.4: sumber kebenaran media profil + cover jenama + upsert selamat.
  test('resolveAvatarSource, cover jenama dan sanitizedUserMap', () {
    // Keutamaan: photo snapshot > photo profil > preset.
    var src = resolveAvatarSource(
        snapshotPhotoUrl: 'https://p/snap.jpg',
        profilePhotoUrl: 'https://p/live.jpg',
        profilePreset: 'magicPlate');
    expect(src.photoUrl, 'https://p/snap.jpg');

    // Snapshot kosong → jatuh ke profil live (post lama konsisten).
    src = resolveAvatarSource(
        snapshotPhotoUrl: '',
        snapshotPreset: null,
        profilePhotoUrl: 'https://p/live.jpg',
        profilePreset: 'magicPlate');
    expect(src.photoUrl, 'https://p/live.jpg');
    expect(src.presetId, 'magicPlate');

    // Tiada photo langsung → preset sahaja.
    src = resolveAvatarSource(profilePreset: 'sambalBowl');
    expect(src.photoUrl, isNull);
    expect(src.presetId, 'sambalBowl');

    // Cover jenama STABIL merah MakanMana — bukan hijau rawak.
    // (Token Bright Mode spec: primaryRed #E83A32.)
    expect(kBrandCoverGradient.first.toARGB32(), 0xFFE83A32);
    expect(kBrandCoverGradient.length, 2);

    // upsert selamat: null TIDAK dihantar (jangan timpa media), pelan
    // dibuang (PAY-01).
    final map = UserRepository.sanitizedUserMap(const AppUser(
      uid: 'u1',
      email: 'a@b.com',
      // displayName & photoUrl null — mesti TIDAK wujud dlm map.
    ));
    expect(map.containsKey('displayName'), isFalse,
        reason: 'null tidak boleh menimpa nama sedia ada');
    expect(map.containsKey('photoUrl'), isFalse);
    expect(map.containsKey('plan'), isFalse);
    expect(map.containsKey('planStatus'), isFalse);
    expect(map['email'], 'a@b.com');

    // Dengan nama diberi → nama dihantar.
    final map2 = UserRepository.sanitizedUserMap(const AppUser(
        uid: 'u1', email: 'a@b.com', displayName: 'Hachiman'));
    expect(map2['displayName'], 'Hachiman');
  });

  // SP10.3: kekuatan password + validasi daftar (tulen).
  test('passwordStrength dan validateRegister', () {
    expect(passwordStrength('abc'), PasswordStrength.weak);
    expect(passwordStrength('abcdefgh'), PasswordStrength.medium);
    expect(passwordStrength('Abcdefg1'), PasswordStrength.strong);
    expect(passwordStrength('abcdefg!1'), PasswordStrength.strong);
    expect(passwordStrengthKey(PasswordStrength.weak), 'pwStrengthWeak');

    String? v({
      String name = 'Hachiman',
      String email = 'a@b.com',
      String pw = 'password123',
      String confirm = 'password123',
      bool terms = true,
    }) =>
        validateRegister(
          displayName: name,
          email: email,
          password: pw,
          confirmPassword: confirm,
          termsAccepted: terms,
        );

    expect(v(), isNull, reason: 'borang sah = null');
    expect(v(name: 'A'), 'nameInvalid');
    expect(v(email: 'bukan-email'), 'authErrInvalidEmail');
    expect(v(pw: 'pendek', confirm: 'pendek'), 'authErrWeakPassword',
        reason: 'kurang 8 aksara');
    expect(v(confirm: 'lain12345'), 'passwordsNoMatch');
    expect(v(terms: false), 'agreeTermsRequired');

    // Kunci l10n daftar wujud semua bahasa; mesej login TANPA ayat
    // Google (Google dimatikan — jangan kelirukan).
    for (final lang in ['ms', 'en', 'zh', 'ta']) {
      final l = AppLocalizations(Locale(lang));
      for (final key in [
        'registerTitle',
        'confirmPasswordLabel',
        'termsAgreeLabel',
        'agreeTermsRequired',
        'passwordsNoMatch',
        'nameInvalid',
        'pwStrengthWeak',
        'pwStrengthStrong',
        'registerFailed',
        'orDivider',
      ]) {
        expect(l.t(key), isNot(key), reason: '$key perlu $lang');
      }
      expect(l.t('authErrWrongPassword').contains('Google'), isFalse,
          reason: 'mesej login tidak sebut Google ($lang)');
    }
  });

  // SP10: reset password — mesej neutral (tiada account enumeration).
  test('resetPasswordMessageKey neutral untuk user-not-found', () {
    expect(resetPasswordMessageKey(null), 'resetLinkSent');
    expect(resetPasswordMessageKey('user-not-found'), 'resetLinkSent',
        reason: 'jangan dedahkan kewujudan akaun');
    expect(resetPasswordMessageKey('invalid-email'), 'authErrInvalidEmail');
    expect(resetPasswordMessageKey('network-request-failed'),
        'authErrNetwork');
    expect(resetPasswordMessageKey('too-many-requests'), 'authErrTooMany');
  });

  // SP10: HARGA TIDAK BERUBAH + kunci promo wujud semua bahasa.
  test('harga pelan kekal dan promo l10n lengkap', () {
    expect(PlanConstants.plusPriceLabel, 'RM9.99',
        reason: 'harga Plus mesti kekal');
    expect(PlanConstants.proPriceLabel, 'RM29.90',
        reason: 'harga Pro mesti kekal');
    expect(PlanConstants.devMockUpgradeEnabled, isFalse,
        reason: 'mock upgrade mesti kekal OFF (PAY-01)');
    for (final lang in ['ms', 'en', 'zh', 'ta']) {
      final l = AppLocalizations(Locale(lang));
      for (final key in [
        'launchPromoTitle',
        'save60Badge',
        'launchPromoNote',
        'forgotPassword',
        'resetLinkSent',
        'appearanceLabel',
        'appearanceSystem',
        'appearanceLight',
        'appearanceDark',
        'chooseMakanAvatar',
        'avatarSambalBowl',
        'googleNotActive',
        'phoneNotActive',
      ]) {
        expect(l.t(key), isNot(key), reason: '$key perlu $lang');
      }
    }
  });

  // SP10.1B: Google/Phone auth live — helper & pemetaan ralat.
  test('normalizePhoneNumber format MY dan E.164', () {
    expect(normalizePhoneNumber('0123456789'), '+60123456789');
    expect(normalizePhoneNumber('60123456789'), '+60123456789');
    expect(normalizePhoneNumber('+60 12-345 6789'), '+60123456789');
    expect(normalizePhoneNumber('123456789'), '+60123456789');
    expect(normalizePhoneNumber('+14155550100'), '+14155550100',
        reason: 'nombor test luar negara dibenarkan');
    expect(normalizePhoneNumber(''), isNull);
    expect(normalizePhoneNumber('abc'), isNull);
    expect(normalizePhoneNumber('0123'), isNull,
        reason: 'terlalu pendek');
    expect(normalizePhoneNumber('+6012345678901234'), isNull,
        reason: 'melebihi 15 digit E.164');
  });

  test('pemetaan ralat Google/Phone mesra pengguna', () {
    // GoogleSignInException codes (v7 e.code.name).
    expect(googleErrorKey('canceled'), 'authErrCancelled');
    expect(googleErrorKey('interrupted'), 'authErrCancelled');
    expect(googleErrorKey('clientConfigurationError'),
        'authErrGoogleConfig');
    expect(googleErrorKey('providerConfigurationError'),
        'authErrGoogleConfig');
    expect(googleErrorKey('unknownError'), 'authError');
    // FirebaseAuthException codes untuk Phone OTP.
    expect(authErrorKey('invalid-phone-number'), 'authErrPhoneInvalid');
    expect(authErrorKey('invalid-verification-code'), 'authErrOtpInvalid');
    expect(authErrorKey('session-expired'), 'authErrOtpExpired');
    expect(authErrorKey('account-exists-with-different-credential'),
        'authErrDiffCredential');
    expect(authErrorKey('quota-exceeded'), 'authErrTooMany');
    expect(authErrorKey('missing-client-identifier'),
        'authErrGoogleConfig');
    // 10.1B-PHONE-CLOSE: SMS Region Policy (17006) — mesej jujur.
    expect(authErrorKey('operation-not-allowed'), 'authErrPhoneRegion');
  });

  test('authExtraFields selamat: tiada protected, tiada null/kosong', () {
    final full = authExtraFields(
      phoneNumber: '+60123456789',
      providerIds: ['google.com', 'password'],
    );
    expect(full['phoneNumber'], '+60123456789');
    expect(full['providerIds'], ['google.com', 'password']);
    for (final banned in [
      'plan', 'planStatus', 'planSource', 'isAdmin', 'admin', 'role',
      'roles', 'permissions', 'customClaims', 'claims',
    ]) {
      expect(full.containsKey(banned), isFalse,
          reason: '$banned tak boleh ditulis client');
    }
    final empty = authExtraFields(phoneNumber: null, providerIds: []);
    expect(empty, isEmpty, reason: 'null/kosong TIDAK dihantar');
    expect(empty.containsValue(null), isFalse);
  });

  test('flag Google/Phone aktif + label l10n live wujud', () {
    expect(kGoogleSignInConfigured, isTrue,
        reason: 'SP10.1B: console siap, Google live');
    expect(kPhoneAuthConfigured, isTrue,
        reason: 'SP10.1B: console siap, Phone live');
    for (final lang in ['ms', 'en', 'zh', 'ta']) {
      final l = AppLocalizations(Locale(lang));
      for (final key in [
        'signInGoogle',
        'signInPhone',
        'phoneNumberHint',
        'sendOtp',
        'otpHint',
        'verifyOtp',
        'resendOtp',
        'otpSent',
        'authErrPhoneInvalid',
        'authErrOtpInvalid',
        'authErrOtpExpired',
        'authErrCancelled',
        'authErrGoogleConfig',
        'authErrDiffCredential',
        'authErrPhoneRegion',
        // PROMPT 11: legal + padam akaun.
        'legalSection',
        'termsLabel',
        'guidelinesLabel',
        'supportLabel',
        'deleteAccountLabel',
        'deleteAccountBody',
        'deleteAccountConfirm',
        'deleteRequestSent',
        'termsReadLink',
        // PROMPT 12: kupon Pro Trial.
        'couponTitle',
        'couponSubtitle',
        'couponInputHint',
        'couponRedeem',
        'couponSuccess',
        'couponActiveUntil',
        'couponExpiredNote',
        'couponPaymentNote',
        'couponEntrySettings',
        'couponEntryPaywall',
        'planProTrial',
      ]) {
        expect(l.t(key), isNot(key), reason: '$key perlu $lang');
      }
    }
  });
}
