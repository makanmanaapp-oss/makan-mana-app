/// PART 1 Phase 1.14A — kunci l10n ralat pembetulan dipercayai (ms/en/zh/ta).
/// Digunakan oleh TrustedPlaceCorrectionRepository (DILUMPUHKAN lalai) untuk
/// memetakan kod ralat callable selamat -> mesej pengguna 4 bahasa.
library;

const Map<String, String> kCorrectionErrorStringsMs = {
  'correctionErrLogin': 'Sila log masuk untuk menghantar laporan.',
  'correctionErrAppCheck': 'Sesi tidak disahkan. Cuba lagi.',
  'correctionErrInvalid': 'Maklumat laporan tidak sah.',
  'correctionErrDescShort': 'Penerangan terlalu pendek.',
  'correctionErrDescLong': 'Penerangan terlalu panjang.',
  'correctionErrEvidence': 'Bukti diperlukan atau tidak sah.',
  'correctionErrRateLimited': 'Terlalu banyak laporan. Cuba sebentar lagi.',
  'correctionErrDuplicate': 'Laporan serupa sudah dihantar.',
  'correctionErrUnavailable': 'Perkhidmatan tidak tersedia. Cuba lagi.',
  'correctionErrInternal': 'Laporan gagal dihantar. Cuba lagi.',
};

const Map<String, String> kCorrectionErrorStringsEn = {
  'correctionErrLogin': 'Please log in to submit a report.',
  'correctionErrAppCheck': 'Unverified session. Please try again.',
  'correctionErrInvalid': 'Report details are invalid.',
  'correctionErrDescShort': 'Description is too short.',
  'correctionErrDescLong': 'Description is too long.',
  'correctionErrEvidence': 'Evidence is required or invalid.',
  'correctionErrRateLimited': 'Too many reports. Please try again later.',
  'correctionErrDuplicate': 'A similar report was already submitted.',
  'correctionErrUnavailable': 'Service unavailable. Please try again.',
  'correctionErrInternal': 'Report could not be submitted. Please try again.',
};

const Map<String, String> kCorrectionErrorStringsZh = {
  'correctionErrLogin': '请登录后提交举报。',
  'correctionErrAppCheck': '会话未验证，请重试。',
  'correctionErrInvalid': '举报信息无效。',
  'correctionErrDescShort': '描述太短。',
  'correctionErrDescLong': '描述太长。',
  'correctionErrEvidence': '需要证据或证据无效。',
  'correctionErrRateLimited': '举报过于频繁，请稍后再试。',
  'correctionErrDuplicate': '已提交过类似举报。',
  'correctionErrUnavailable': '服务不可用，请重试。',
  'correctionErrInternal': '举报提交失败，请重试。',
};

const Map<String, String> kCorrectionErrorStringsTa = {
  'correctionErrLogin': 'புகாரளிக்க உள்நுழையவும்.',
  'correctionErrAppCheck': 'அமர்வு சரிபார்க்கப்படவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'correctionErrInvalid': 'புகார் விவரங்கள் தவறானவை.',
  'correctionErrDescShort': 'விளக்கம் மிகக் குறைவு.',
  'correctionErrDescLong': 'விளக்கம் மிக நீளமானது.',
  'correctionErrEvidence': 'சான்று தேவை அல்லது தவறானது.',
  'correctionErrRateLimited': 'அதிக புகார்கள். பின்னர் முயற்சிக்கவும்.',
  'correctionErrDuplicate': 'இதே போன்ற புகார் ஏற்கனவே சமர்ப்பிக்கப்பட்டது.',
  'correctionErrUnavailable': 'சேவை கிடைக்கவில்லை. மீண்டும் முயற்சிக்கவும்.',
  'correctionErrInternal': 'புகார் சமர்ப்பிக்க முடியவில்லை. மீண்டும் முயற்சிக்கவும்.',
};
