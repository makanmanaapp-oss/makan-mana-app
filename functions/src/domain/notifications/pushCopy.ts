/**
 * PROMPT 3 — server-side PUSH copy (pure). Lock-screen-safe + localized.
 *
 * The tray/lock-screen shows this text before any app code runs, so the server
 * must pre-localize. Copy is GENERIC (no private post/comment/group details) to
 * respect lock-screen privacy (Part 16). Mirrors the in-app titleKey/bodyKey
 * wording; the canonical Firestore record stays authoritative. BM/EN/ZH/TA.
 */
import {NotificationType} from "./notificationContract";

export type PushLang = "ms" | "en" | "zh" | "ta";

const LANGS: readonly PushLang[] = ["ms", "en", "zh", "ta"];

export function normalizePushLang(raw: string | undefined | null): PushLang {
  const v = (raw ?? "").trim().toLowerCase().slice(0, 2);
  return (LANGS as readonly string[]).includes(v) ? (v as PushLang) : "ms";
}

interface Copy {
  title: Record<PushLang, string>;
  body: Record<PushLang, string>;
}

/** Only push-eligible types (social/group + critical). No private details. */
const PUSH_COPY: Partial<Record<NotificationType, Copy>> = {
  social_reaction: {
    title: {ms: "Reaksi baharu", en: "New reaction", zh: "新的互动", ta: "புதிய ரியாக்ஷன்"},
    body: {ms: "Seseorang memberi reaksi pada siaran anda.", en: "Someone reacted to your post.", zh: "有人对你的贴文作出反应。", ta: "உங்கள் பதிவுக்கு ஒருவர் ரியாக்ஷன் அளித்தார்."},
  },
  social_comment: {
    title: {ms: "Komen baharu", en: "New comment", zh: "新的评论", ta: "புதிய கருத்து"},
    body: {ms: "Ada komen baharu pada siaran anda.", en: "There's a new comment on your post.", zh: "你的贴文有新评论。", ta: "உங்கள் பதிவில் புதிய கருத்து உள்ளது."},
  },
  social_reply: {
    title: {ms: "Balasan baharu", en: "New reply", zh: "新的回复", ta: "புதிய பதில்"},
    body: {ms: "Seseorang membalas komen anda.", en: "Someone replied to your comment.", zh: "有人回复了你的评论。", ta: "உங்கள் கருத்துக்கு ஒருவர் பதிலளித்தார்."},
  },
  social_mention: {
    title: {ms: "Anda disebut", en: "You were mentioned", zh: "有人提到你", ta: "உங்களைக் குறிப்பிட்டனர்"},
    body: {ms: "Seseorang menyebut anda.", en: "Someone mentioned you.", zh: "有人提到了你。", ta: "ஒருவர் உங்களைக் குறிப்பிட்டார்."},
  },
  social_follow: {
    title: {ms: "Pengikut baharu", en: "New follower", zh: "新的追随者", ta: "புதிய பின்தொடர்பவர்"},
    body: {ms: "Seseorang mula mengikuti anda.", en: "Someone started following you.", zh: "有人开始关注你。", ta: "ஒருவர் உங்களைப் பின்தொடரத் தொடங்கினார்."},
  },
  social_repost: {
    title: {ms: "Siaran anda dikongsi semula", en: "Your post was reposted", zh: "你的贴文被转发", ta: "உங்கள் பதிவு மீள்பகிரப்பட்டது"},
    body: {ms: "Seseorang berkongsi semula siaran anda.", en: "Someone reposted your post.", zh: "有人转发了你的贴文。", ta: "ஒருவர் உங்கள் பதிவை மீள்பகிர்ந்தார்."},
  },
  social_quote: {
    title: {ms: "Siaran anda dipetik", en: "Your post was quoted", zh: "你的贴文被引用", ta: "உங்கள் பதிவு மேற்கோள் காட்டப்பட்டது"},
    body: {ms: "Seseorang memetik siaran anda.", en: "Someone quoted your post.", zh: "有人引用了你的贴文。", ta: "ஒருவர் உங்கள் பதிவை மேற்கோள் காட்டினார்."},
  },
  group_invite: {
    title: {ms: "Jemputan grup baharu", en: "New group invite", zh: "新的群组邀请", ta: "புதிய குழு அழைப்பு"},
    body: {ms: "Anda dijemput menyertai sebuah grup.", en: "You've been invited to join a group.", zh: "你被邀请加入一个群组。", ta: "ஒரு குழுவில் சேர அழைக்கப்பட்டீர்கள்."},
  },
  group_invite_accepted: {
    title: {ms: "Jemputan diterima", en: "Invite accepted", zh: "邀请已接受", ta: "அழைப்பு ஏற்கப்பட்டது"},
    body: {ms: "Seseorang menerima jemputan grup anda.", en: "Someone accepted your group invite.", zh: "有人接受了你的群组邀请。", ta: "உங்கள் குழு அழைப்பை ஒருவர் ஏற்றார்."},
  },
  account_security: {
    title: {ms: "Amaran keselamatan", en: "Security alert", zh: "安全提醒", ta: "பாதுகாப்பு எச்சரிக்கை"},
    body: {ms: "Ada aktiviti keselamatan pada akaun anda.", en: "There's a security activity on your account.", zh: "你的账户有安全活动。", ta: "உங்கள் கணக்கில் பாதுகாப்பு செயல்பாடு உள்ளது."},
  },
  payment_issue: {
    title: {ms: "Isu pembayaran", en: "Payment issue", zh: "付款问题", ta: "கட்டண சிக்கல்"},
    body: {ms: "Ada isu dengan pembayaran anda.", en: "There's an issue with your payment.", zh: "你的付款出现问题。", ta: "உங்கள் கட்டணத்தில் சிக்கல் உள்ளது."},
  },
};

export function hasPushCopy(type: NotificationType): boolean {
  return type in PUSH_COPY;
}

/** Localized, lock-screen-safe title/body. Falls back deterministically. */
export function pushCopyFor(type: NotificationType, lang: string | undefined): {title: string; body: string} | null {
  const copy = PUSH_COPY[type];
  if (!copy) return null;
  const l = normalizePushLang(lang);
  return {title: copy.title[l] ?? copy.title.ms, body: copy.body[l] ?? copy.body.ms};
}
