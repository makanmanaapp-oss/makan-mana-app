# MakanMana 0.1.9 (versionCode 14) — release notes

Play "What's new" copy. Both languages are within Play's 500-character limit.
User-facing only: nothing here mentions rules, migrations, backfills or any
internal rollout.

---

## Bahasa Melayu

```
Halaman restoran kini lebih kemas dan mudah dibaca.

• Profil, Ulasan dan Menu kini dalam tab berasingan — lebih pantas dicari
• Butang Ikut restoran lebih tepat: bilangan pengikut dan status "Diikuti"
  kini sentiasa jujur, dan tidak lagi memaparkan "0" apabila data belum sedia
• Feed dan komen lebih stabil dan konsisten
• Penandaan notifikasi sebagai "sudah dibaca" kini lebih dipercayai

Terima kasih kerana terus menggunakan MakanMana.
```

## English

```
The restaurant page is cleaner and easier to read.

• Profile, Reviews and Menu now sit in separate tabs, so what you want is
  quicker to find
• The restaurant Follow button is more accurate: the follower count and the
  "Following" state are now always truthful, and no longer show "0" while
  data is still loading
• Feed and comments are more stable and consistent
• Marking notifications as read is now more reliable

Thanks for using MakanMana.
```

---

## Short variant (if a tighter limit applies)

**BM:** `Halaman restoran lebih kemas dengan tab Profil, Ulasan dan Menu. Butang Ikut kini lebih tepat. Feed, komen dan notifikasi lebih stabil.`

**EN:** `A cleaner restaurant page with separate Profile, Reviews and Menu tabs. A more accurate Follow button. More stable feed, comments and notifications.`

---

## What is deliberately NOT mentioned

- the Firestore lifecycle rules cutover and its ordering
- the engagement rules already deployed
- any backfill, freeze or migration
- that this build is a precondition for a later server-side change

These are internal rollout mechanics. The user-visible statements above are all
true of this build on its own.
