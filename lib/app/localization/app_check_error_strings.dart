/// PART 1 Phase 1.14B.2 — kunci l10n ralat App Check / callable dipercayai.
/// Mesej selamat (tiada butiran teknikal/token/ID projek). 4 bahasa.
library;

const Map<String, String> kAppCheckErrorStringsMs = {
  'appCheckErrNotReady': 'Sesi keselamatan belum sedia. Cuba lagi sebentar.',
  'appCheckErrToken': 'Pengesahan peranti tidak tersedia. Cuba lagi.',
  'appCheckErrRejected': 'Peranti gagal pengesahan keselamatan.',
  'appCheckErrPlayIntegrity': 'Semakan integriti Play tidak tersedia pada peranti ini.',
  'appCheckErrDisabled': 'Ciri laporan belum tersedia buat masa ini.',
};

const Map<String, String> kAppCheckErrorStringsEn = {
  'appCheckErrNotReady': 'Security session is not ready yet. Please try again shortly.',
  'appCheckErrToken': 'Device verification is unavailable. Please try again.',
  'appCheckErrRejected': 'This device failed the security check.',
  'appCheckErrPlayIntegrity': 'Play integrity check is unavailable on this device.',
  'appCheckErrDisabled': 'Reporting is not available yet.',
};

const Map<String, String> kAppCheckErrorStringsZh = {
  'appCheckErrNotReady': '安全会话尚未就绪，请稍后重试。',
  'appCheckErrToken': '设备验证不可用，请重试。',
  'appCheckErrRejected': '此设备未通过安全检查。',
  'appCheckErrPlayIntegrity': '此设备无法进行 Play 完整性检查。',
  'appCheckErrDisabled': '举报功能暂未开放。',
};

const Map<String, String> kAppCheckErrorStringsTa = {
  'appCheckErrNotReady': 'பாதுகாப்பு அமர்வு இன்னும் தயாராகவில்லை. சிறிது நேரத்தில் முயற்சிக்கவும்.',
  'appCheckErrToken': 'சாதன சரிபார்ப்பு கிடைக்கவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'appCheckErrRejected': 'இந்த சாதனம் பாதுகாப்பு சோதனையில் தோல்வியடைந்தது.',
  'appCheckErrPlayIntegrity': 'இந்த சாதனத்தில் Play ஒருமைப்பாடு சோதனை கிடைக்கவில்லை.',
  'appCheckErrDisabled': 'புகாரளிப்பு இன்னும் கிடைக்கவில்லை.',
};
