/// ISSUE 003 — SUMBER KEBENARAN KANONIKAL untuk taksonomi citarasa.
///
/// Prinsip teras (Seksyen 4 spec): SATU sumber, ID STABIL bebas bahasa,
/// label diselesaikan hanya pada masa paparan. TIADA label terjemah
/// disimpan sebagai nilai. Modul ini bersifat TAMBAHAN (additive) dan
/// TIDAK mengubah model persistence sedia ada — jadi pengguna lama & aliran
/// cadangan kekal 100% serasi.
///
/// Setiap [TasteOption] membawa ID stabil + label 4 bahasa (parity dijamin
/// secara pembinaan). Terjemahan zh/ta = "Pending native review".
library;

/// Satu pilihan citarasa: ID stabil + label 4 bahasa.
class TasteOption {
  const TasteOption(
    this.id, {
    required this.ms,
    required this.en,
    required this.zh,
    required this.ta,
    this.popular = false,
  });

  /// ID kanonikal STABIL — jangan tukar; ini yang disimpan ke Firestore.
  final String id;
  final String ms;
  final String en;
  final String zh;
  final String ta;

  /// Ditayang dahulu dalam corak "Popular → View all".
  final bool popular;

  /// Label ikut kod bahasa; fallback ms (bukan nama kunci) supaya tiada
  /// key-name bocor ke UI.
  String label(String langCode) => switch (langCode) {
        'en' => en,
        'zh' => zh,
        'ta' => ta,
        _ => ms,
      };
}

/// Satu kumpulan berkategori (untuk corak Category → Popular → View all).
class TasteCategory {
  const TasteCategory(this.id, {required this.options});
  final String id;
  final List<TasteOption> options;
}

// ============================================================
// 1. MATLAMAT MAKANAN (food goal) — BEZA dari Fit Coach goal.
//    Ini isyarat KEUTAMAAN MAKANAN sahaja (bukan sasaran latihan Fit).
// ============================================================
const List<TasteOption> kFoodGoals = [
  TasteOption('eat_anything',
      ms: 'Makan apa sahaja', en: 'Eat anything', zh: '什么都吃', ta: 'எதையும் சாப்பிடுவேன்', popular: true),
  TasteOption('discover_new',
      ms: 'Terokai makanan baru', en: 'Discover new food', zh: '发现新美食', ta: 'புதிய உணவைக் கண்டறி', popular: true),
  TasteOption('eat_healthier',
      ms: 'Makan lebih sihat', en: 'Eat healthier', zh: '吃得更健康', ta: 'ஆரோக்கியமாக சாப்பிடு', popular: true),
  TasteOption('save_money',
      ms: 'Jimat wang', en: 'Save money', zh: '省钱', ta: 'பணம் சேமி', popular: true),
  TasteOption('quick_convenient',
      ms: 'Cepat & mudah', en: 'Quick & convenient', zh: '快速方便', ta: 'விரைவு & வசதி'),
  TasteOption('family_friendly',
      ms: 'Sesuai keluarga', en: 'Family-friendly', zh: '适合家庭', ta: 'குடும்பத்திற்கு ஏற்ற'),
  TasteOption('weight_loss',
      ms: 'Turun berat', en: 'Weight loss', zh: '减重', ta: 'எடை குறைப்பு'),
  TasteOption('weight_gain',
      ms: 'Naik berat', en: 'Weight gain', zh: '增重', ta: 'எடை அதிகரிப்பு'),
  TasteOption('muscle_gain',
      ms: 'Naik otot', en: 'Muscle gain', zh: '增肌', ta: 'தசை வளர்ச்சி'),
  TasteOption('maintain_weight',
      ms: 'Kekalkan berat', en: 'Maintain weight', zh: '维持体重', ta: 'எடையை பராமரி'),
  TasteOption('balanced_eating',
      ms: 'Pemakanan seimbang', en: 'Balanced eating', zh: '均衡饮食', ta: 'சமச்சீர் உணவு', popular: true),
];

// ============================================================
// 2. KEUTAMAAN HALAL — dedikasi, bukan tersembunyi dalam diet.
// ============================================================
const List<TasteOption> kHalalOptions = [
  TasteOption('halal_required',
      ms: 'Halal wajib', en: 'Halal required', zh: '必须清真', ta: 'ஹலால் அவசியம்', popular: true),
  TasteOption('halal_preferred',
      ms: 'Utamakan halal', en: 'Prefer halal', zh: '优先清真', ta: 'ஹலால் விருப்பம்'),
  TasteOption('no_halal_filter',
      ms: 'Jangan tapis ikut halal', en: 'Do not filter by halal', zh: '不按清真筛选', ta: 'ஹலால் வடிகட்ட வேண்டாம்'),
];

// ============================================================
// 3. CORAK DIET (dietary pattern) — 20 ID stabil (Seksyen 10).
// ============================================================
const List<TasteOption> kDietPatterns = [
  TasteOption('omnivore',
      ms: 'Makan semua', en: 'Omnivore', zh: '荤素都吃', ta: 'அனைத்தும் உண்பவர்', popular: true),
  TasteOption('vegetarian',
      ms: 'Vegetarian', en: 'Vegetarian', zh: '素食', ta: 'சைவம்', popular: true),
  TasteOption('vegan',
      ms: 'Vegan', en: 'Vegan', zh: '纯素', ta: 'முழு சைவம்', popular: true),
  TasteOption('pescatarian',
      ms: 'Pescatarian', en: 'Pescatarian', zh: '鱼素', ta: 'மீன் சைவம்'),
  TasteOption('flexitarian',
      ms: 'Flexitarian', en: 'Flexitarian', zh: '弹性素食', ta: 'நெகிழ் சைவம்'),
  TasteOption('plant_based',
      ms: 'Berasaskan tumbuhan', en: 'Plant-based', zh: '植物为主', ta: 'தாவர அடிப்படை'),
  TasteOption('keto',
      ms: 'Keto', en: 'Keto', zh: '生酮', ta: 'கீட்டோ'),
  TasteOption('low_carb',
      ms: 'Rendah karbohidrat', en: 'Low carb', zh: '低碳水', ta: 'குறை கார்போ'),
  TasteOption('high_protein',
      ms: 'Tinggi protein', en: 'High protein', zh: '高蛋白', ta: 'அதிக புரதம்', popular: true),
  TasteOption('gluten_free',
      ms: 'Bebas gluten', en: 'Gluten-free', zh: '无麸质', ta: 'கிளூட்டன் இல்லாத'),
  TasteOption('dairy_free',
      ms: 'Bebas tenusu', en: 'Dairy-free', zh: '无乳制品', ta: 'பால் இல்லாத'),
  TasteOption('low_sodium',
      ms: 'Rendah garam', en: 'Low sodium', zh: '低钠', ta: 'குறை சோடியம்'),
  TasteOption('low_sugar',
      ms: 'Rendah gula', en: 'Low sugar', zh: '低糖', ta: 'குறை சர்க்கரை'),
  TasteOption('diabetic_friendly',
      ms: 'Mesra diabetik', en: 'Diabetic-friendly', zh: '适合糖尿', ta: 'நீரிழிவுக்கு ஏற்ற'),
  TasteOption('mediterranean',
      ms: 'Mediterranean', en: 'Mediterranean', zh: '地中海', ta: 'மத்திய தரைக்கடல்'),
  TasteOption('balanced',
      ms: 'Seimbang', en: 'Balanced', zh: '均衡', ta: 'சமச்சீர்', popular: true),
  TasteOption('weight_loss',
      ms: 'Turun berat', en: 'Weight loss', zh: '减重', ta: 'எடை குறைப்பு'),
  TasteOption('weight_gain',
      ms: 'Naik berat', en: 'Weight gain', zh: '增重', ta: 'எடை அதிகரிப்பு'),
  TasteOption('muscle_gain',
      ms: 'Naik otot', en: 'Muscle gain', zh: '增肌', ta: 'தசை வளர்ச்சி'),
  TasteOption('custom',
      ms: 'Tersendiri', en: 'Custom', zh: '自定义', ta: 'தனிப்பயன்'),
];

// ============================================================
// 4. ALAHAN & SENSITIVITI (Seksyen 11) — 3 kategori.
// ============================================================
const List<TasteOption> kAllergensCommon = [
  TasteOption('peanuts', ms: 'Kacang tanah', en: 'Peanuts', zh: '花生', ta: 'நிலக்கடலை', popular: true),
  TasteOption('tree_nuts', ms: 'Kacang pokok', en: 'Tree nuts', zh: '坚果', ta: 'மர கொட்டைகள்'),
  TasteOption('dairy', ms: 'Susu / tenusu', en: 'Dairy', zh: '乳制品', ta: 'பால் பொருட்கள்', popular: true),
  TasteOption('eggs', ms: 'Telur', en: 'Eggs', zh: '鸡蛋', ta: 'முட்டை'),
  TasteOption('fish', ms: 'Ikan', en: 'Fish', zh: '鱼', ta: 'மீன்'),
  TasteOption('shrimp', ms: 'Udang', en: 'Shrimp', zh: '虾', ta: 'இறால்', popular: true),
  TasteOption('crab', ms: 'Ketam', en: 'Crab', zh: '螃蟹', ta: 'நண்டு'),
  TasteOption('squid', ms: 'Sotong', en: 'Squid', zh: '鱿鱼', ta: 'கணவாய்'),
  TasteOption('shellfish', ms: 'Kerang', en: 'Shellfish', zh: '贝类', ta: 'சிப்பி வகை'),
  TasteOption('wheat', ms: 'Gandum', en: 'Wheat', zh: '小麦', ta: 'கோதுமை'),
  TasteOption('soy', ms: 'Soya', en: 'Soy', zh: '大豆', ta: 'சோயா'),
  TasteOption('sesame', ms: 'Bijan', en: 'Sesame', zh: '芝麻', ta: 'எள்'),
  TasteOption('mustard', ms: 'Mustard', en: 'Mustard', zh: '芥末', ta: 'கடுகு'),
  TasteOption('celery', ms: 'Saderi', en: 'Celery', zh: '芹菜', ta: 'செலரி'),
  TasteOption('sulphites', ms: 'Sulfit', en: 'Sulphites', zh: '亚硫酸盐', ta: 'சல்பைட்டுகள்'),
];
const List<TasteOption> kAllergensLocal = [
  TasteOption('gluten', ms: 'Gluten', en: 'Gluten', zh: '麸质', ta: 'கிளூட்டன்'),
  TasteOption('lactose', ms: 'Laktosa', en: 'Lactose', zh: '乳糖', ta: 'லாக்டோஸ்'),
  TasteOption('msg', ms: 'MSG', en: 'MSG', zh: '味精', ta: 'அஜினமோட்டோ'),
  TasteOption('belacan', ms: 'Belacan', en: 'Belacan', zh: '虾酱', ta: 'இறால் விழுது'),
  TasteOption('fish_sauce', ms: 'Sos ikan', en: 'Fish sauce', zh: '鱼露', ta: 'மீன் சாஸ்'),
  TasteOption('coconut_milk', ms: 'Santan', en: 'Coconut milk', zh: '椰浆', ta: 'தேங்காய் பால்'),
  TasteOption('chilli', ms: 'Cili', en: 'Chilli', zh: '辣椒', ta: 'மிளகாய்'),
  TasteOption('spicy_food', ms: 'Makanan terlalu pedas', en: 'Very spicy food', zh: '过辣食物', ta: 'மிகுந்த காரம்'),
  TasteOption('onion', ms: 'Bawang', en: 'Onion', zh: '洋葱', ta: 'வெங்காயம்'),
  TasteOption('oily_food', ms: 'Makanan berminyak', en: 'Oily food', zh: '油腻食物', ta: 'எண்ணெய் உணவு'),
];
const List<TasteOption> kAllergensOther = [
  TasteOption('no_known_allergy',
      ms: 'Tiada alahan diketahui', en: 'No known allergy', zh: '无已知过敏', ta: 'அறியப்பட்ட ஒவ்வாமை இல்லை', popular: true),
  TasteOption('custom', ms: 'Lain-lain', en: 'Custom', zh: '其他', ta: 'மற்றவை'),
];

/// Tahap keterukan alahan (severity).
const List<TasteOption> kAllergySeverity = [
  TasteOption('mild', ms: 'Ringan', en: 'Mild', zh: '轻微', ta: 'லேசான'),
  TasteOption('moderate', ms: 'Sederhana', en: 'Moderate', zh: '中等', ta: 'மிதமான'),
  TasteOption('severe', ms: 'Teruk', en: 'Severe', zh: '严重', ta: 'கடுமையான'),
];

// ============================================================
// 5. MASAKAN / CUISINE (Seksyen 12) — kategori A–G.
// ============================================================
const List<TasteCategory> kCuisineCategories = [
  TasteCategory('local', options: [
    TasteOption('malay', ms: 'Melayu', en: 'Malay', zh: '马来', ta: 'மலாய்', popular: true),
    TasteOption('mamak', ms: 'Mamak', en: 'Mamak', zh: '嘛嘛档', ta: 'மாமாக்', popular: true),
    TasteOption('indian_muslim', ms: 'India Muslim', en: 'Indian Muslim', zh: '印度穆斯林', ta: 'இந்திய முஸ்லிம்'),
    TasteOption('malaysian_chinese', ms: 'Cina Malaysia', en: 'Malaysian Chinese', zh: '马来西亚华人', ta: 'மலேசிய சீன', popular: true),
    TasteOption('indian', ms: 'India', en: 'Indian', zh: '印度', ta: 'இந்திய'),
    TasteOption('nyonya', ms: 'Nyonya', en: 'Nyonya', zh: '娘惹', ta: 'நோன்யா'),
    TasteOption('sabah', ms: 'Sabah', en: 'Sabah', zh: '沙巴', ta: 'சபா'),
    TasteOption('sarawak', ms: 'Sarawak', en: 'Sarawak', zh: '砂拉越', ta: 'சரவாக்'),
    TasteOption('kelantan', ms: 'Kelantan', en: 'Kelantan', zh: '吉兰丹', ta: 'கிளந்தான்'),
    TasteOption('terengganu', ms: 'Terengganu', en: 'Terengganu', zh: '登嘉楼', ta: 'திரங்கானு'),
    TasteOption('penang', ms: 'Pulau Pinang', en: 'Penang', zh: '槟城', ta: 'பினாங்கு'),
    TasteOption('johor', ms: 'Johor', en: 'Johor', zh: '柔佛', ta: 'ஜோகூர்'),
    TasteOption('minang', ms: 'Minang', en: 'Minang', zh: '米南加保', ta: 'மினாங்'),
  ]),
  TasteCategory('asean', options: [
    TasteOption('indonesian', ms: 'Indonesia', en: 'Indonesian', zh: '印尼', ta: 'இந்தோனேசிய', popular: true),
    TasteOption('ayam_gepuk', ms: 'Ayam gepuk', en: 'Ayam gepuk', zh: '碎炸鸡', ta: 'அயம் கெபுக்'),
    TasteOption('padang', ms: 'Padang', en: 'Padang', zh: '巴东', ta: 'பாடாங்'),
    TasteOption('thai', ms: 'Thai', en: 'Thai', zh: '泰国', ta: 'தாய்', popular: true),
    TasteOption('vietnamese', ms: 'Vietnam', en: 'Vietnamese', zh: '越南', ta: 'வியட்நாம்'),
    TasteOption('filipino', ms: 'Filipina', en: 'Filipino', zh: '菲律宾', ta: 'பிலிப்பைன்'),
    TasteOption('singaporean', ms: 'Singapura', en: 'Singaporean', zh: '新加坡', ta: 'சிங்கப்பூர்'),
    TasteOption('bruneian', ms: 'Brunei', en: 'Bruneian', zh: '文莱', ta: 'புருனே'),
  ]),
  TasteCategory('east_asian', options: [
    TasteOption('chinese', ms: 'Cina', en: 'Chinese', zh: '中式', ta: 'சீன', popular: true),
    TasteOption('japanese', ms: 'Jepun', en: 'Japanese', zh: '日式', ta: 'ஜப்பானிய', popular: true),
    TasteOption('korean', ms: 'Korea', en: 'Korean', zh: '韩式', ta: 'கொரிய', popular: true),
    TasteOption('taiwanese', ms: 'Taiwan', en: 'Taiwanese', zh: '台式', ta: 'தைவான்'),
    TasteOption('hong_kong', ms: 'Hong Kong', en: 'Hong Kong', zh: '港式', ta: 'ஹாங்காங்'),
    TasteOption('cantonese', ms: 'Kantonis', en: 'Cantonese', zh: '粤菜', ta: 'கான்டனீஸ்'),
    TasteOption('sichuan', ms: 'Sichuan', en: 'Sichuan', zh: '川菜', ta: 'சிச்சுவான்'),
    TasteOption('hainanese', ms: 'Hainan', en: 'Hainanese', zh: '海南', ta: 'ஹைனான்'),
  ]),
  TasteCategory('south_asian', options: [
    TasteOption('pakistani', ms: 'Pakistan', en: 'Pakistani', zh: '巴基斯坦', ta: 'பாகிஸ்தான்'),
    TasteOption('bangladeshi', ms: 'Bangladesh', en: 'Bangladeshi', zh: '孟加拉', ta: 'பங்களாதேஷ்'),
    TasteOption('sri_lankan', ms: 'Sri Lanka', en: 'Sri Lankan', zh: '斯里兰卡', ta: 'இலங்கை'),
  ]),
  TasteCategory('middle_eastern', options: [
    TasteOption('arab', ms: 'Arab', en: 'Arab', zh: '阿拉伯', ta: 'அரபு'),
    TasteOption('middle_eastern', ms: 'Timur Tengah', en: 'Middle Eastern', zh: '中东', ta: 'மத்திய கிழக்கு'),
    TasteOption('turkish', ms: 'Turki', en: 'Turkish', zh: '土耳其', ta: 'துருக்கி'),
    TasteOption('lebanese', ms: 'Lubnan', en: 'Lebanese', zh: '黎巴嫩', ta: 'லெபனான்'),
    TasteOption('persian', ms: 'Parsi', en: 'Persian', zh: '波斯', ta: 'பாரசீக'),
    TasteOption('mediterranean', ms: 'Mediterranean', en: 'Mediterranean', zh: '地中海', ta: 'மத்திய தரைக்கடல்'),
    TasteOption('greek', ms: 'Greek', en: 'Greek', zh: '希腊', ta: 'கிரேக்க'),
  ]),
  TasteCategory('western', options: [
    TasteOption('western', ms: 'Barat', en: 'Western', zh: '西式', ta: 'மேற்கத்திய', popular: true),
    TasteOption('italian', ms: 'Itali', en: 'Italian', zh: '意式', ta: 'இத்தாலிய'),
    TasteOption('french', ms: 'Perancis', en: 'French', zh: '法式', ta: 'பிரெஞ்சு'),
    TasteOption('spanish', ms: 'Sepanyol', en: 'Spanish', zh: '西班牙', ta: 'ஸ்பானிஷ்'),
    TasteOption('mexican', ms: 'Mexico', en: 'Mexican', zh: '墨西哥', ta: 'மெக்சிகன்'),
    TasteOption('american', ms: 'Amerika', en: 'American', zh: '美式', ta: 'அமெரிக்க'),
    TasteOption('african', ms: 'Afrika', en: 'African', zh: '非洲', ta: 'ஆப்பிரிக்க'),
  ]),
  TasteCategory('style', options: [
    TasteOption('cafe', ms: 'Kafe', en: 'Cafe', zh: '咖啡馆', ta: 'கஃபே', popular: true),
    TasteOption('bakery', ms: 'Bakeri', en: 'Bakery', zh: '烘焙', ta: 'பேக்கரி'),
    TasteOption('pastry', ms: 'Pastri', en: 'Pastry', zh: '糕点', ta: 'பேஸ்ட்ரி'),
    TasteOption('dessert', ms: 'Pencuci mulut', en: 'Dessert', zh: '甜点', ta: 'இனிப்பு'),
    TasteOption('street_food', ms: 'Makanan jalanan', en: 'Street food', zh: '街头小吃', ta: 'தெரு உணவு', popular: true),
    TasteOption('seafood', ms: 'Makanan laut', en: 'Seafood', zh: '海鲜', ta: 'கடல் உணவு', popular: true),
    TasteOption('healthy_food', ms: 'Makanan sihat', en: 'Healthy food', zh: '健康餐', ta: 'ஆரோக்கிய உணவு'),
    TasteOption('fusion', ms: 'Fusion', en: 'Fusion', zh: '融合菜', ta: 'கலவை'),
    TasteOption('fast_food', ms: 'Makanan segera', en: 'Fast food', zh: '快餐', ta: 'துரித உணவு'),
  ]),
];

/// Semua cuisine dalam satu senarai rata (untuk carian).
List<TasteOption> get kAllCuisines =>
    [for (final c in kCuisineCategories) ...c.options];

// ============================================================
// 6. TOLERANSI PEDAS (Seksyen 13).
// ============================================================
const List<TasteOption> kSpiceLevels = [
  TasteOption('none', ms: 'Tak makan pedas', en: 'No spice', zh: '不吃辣', ta: 'காரம் இல்லை'),
  TasteOption('very_mild', ms: 'Sangat ringan', en: 'Very mild', zh: '微微辣', ta: 'மிக லேசான'),
  TasteOption('mild', ms: 'Ringan', en: 'Mild', zh: '小辣', ta: 'லேசான'),
  TasteOption('medium', ms: 'Sederhana', en: 'Medium', zh: '中辣', ta: 'நடுத்தர', popular: true),
  TasteOption('spicy', ms: 'Pedas', en: 'Spicy', zh: '辣', ta: 'காரம்', popular: true),
  TasteOption('very_spicy', ms: 'Sangat pedas', en: 'Very spicy', zh: '很辣', ta: 'மிகக் காரம்'),
  TasteOption('extreme', ms: 'Extreme', en: 'Extreme', zh: '极辣', ta: 'தீவிர காரம்'),
  TasteOption('depends_on_dish', ms: 'Ikut hidangan', en: 'Depends on dish', zh: '看菜而定', ta: 'உணவைப் பொறுத்து'),
  TasteOption('custom', ms: 'Tersendiri', en: 'Custom', zh: '自定义', ta: 'தனிப்பயன்'),
];

// ============================================================
// 7. CITARASA / GAYA (soft, Seksyen 14).
// ============================================================
const List<TasteOption> kTastePreferences = [
  TasteOption('sweet', ms: 'Manis', en: 'Sweet', zh: '甜', ta: 'இனிப்பு'),
  TasteOption('savoury', ms: 'Masin/gurih', en: 'Savoury', zh: '咸香', ta: 'உப்பு சுவை'),
  TasteOption('sour', ms: 'Masam', en: 'Sour', zh: '酸', ta: 'புளிப்பு'),
  TasteOption('smoky', ms: 'Smoky', en: 'Smoky', zh: '烟熏', ta: 'புகை சுவை'),
  TasteOption('creamy', ms: 'Creamy', en: 'Creamy', zh: '奶香', ta: 'கிரீமி'),
  TasteOption('crispy', ms: 'Rangup', en: 'Crispy', zh: '酥脆', ta: 'மொறுமொறு'),
  TasteOption('soupy', ms: 'Berkuah', en: 'Soupy', zh: '汤汁', ta: 'சூப் வகை'),
  TasteOption('grilled', ms: 'Panggang', en: 'Grilled', zh: '烧烤', ta: 'கிரில்'),
  TasteOption('fried', ms: 'Goreng', en: 'Fried', zh: '油炸', ta: 'பொரித்த'),
  TasteOption('fresh_light', ms: 'Segar & ringan', en: 'Fresh & light', zh: '清淡', ta: 'புதிய & இலகு'),
  TasteOption('rich_heavy', ms: 'Kaya & berat', en: 'Rich & heavy', zh: '浓郁', ta: 'நிறைவான'),
];

// ============================================================
// 8. WAKTU MAKAN BIASA (Seksyen 15).
// ============================================================
const List<TasteOption> kMealTimes = [
  TasteOption('breakfast', ms: 'Sarapan', en: 'Breakfast', zh: '早餐', ta: 'காலை உணவு', popular: true),
  TasteOption('brunch', ms: 'Brunch', en: 'Brunch', zh: '早午餐', ta: 'பிரஞ்ச்'),
  TasteOption('lunch', ms: 'Makan tengah hari', en: 'Lunch', zh: '午餐', ta: 'மதிய உணவு', popular: true),
  TasteOption('tea_time', ms: 'Minum petang', en: 'Tea time', zh: '下午茶', ta: 'தேநீர் நேரம்'),
  TasteOption('dinner', ms: 'Makan malam', en: 'Dinner', zh: '晚餐', ta: 'இரவு உணவு', popular: true),
  TasteOption('supper', ms: 'Supper', en: 'Supper', zh: '宵夜', ta: 'இரவு சிற்றுண்டி'),
  TasteOption('snack', ms: 'Snek', en: 'Snack', zh: '零食', ta: 'சிற்றுண்டி'),
  TasteOption('late_night', ms: 'Lewat malam', en: 'Late night', zh: '深夜', ta: 'நள்ளிரவு'),
];

// ============================================================
// 9. KONTEKS MAKAN KHAS (Seksyen 16) — Ramadan/fitness/gaya hidup.
// ============================================================
const List<TasteOption> kMealContexts = [
  TasteOption('sahur', ms: 'Sahur', en: 'Sahur', zh: '封斋饭', ta: 'சஹூர்'),
  TasteOption('iftar', ms: 'Iftar / berbuka', en: 'Iftar', zh: '开斋', ta: 'இஃப்தார்'),
  TasteOption('after_tarawih', ms: 'Selepas terawih', en: 'After tarawih', zh: '塔拉威后', ta: 'தராவீஹ் பிறகு'),
  TasteOption('pre_workout', ms: 'Sebelum senaman', en: 'Pre-workout', zh: '锻炼前', ta: 'பயிற்சிக்கு முன்'),
  TasteOption('post_workout', ms: 'Selepas senaman', en: 'Post-workout', zh: '锻炼后', ta: 'பயிற்சிக்கு பின்'),
  TasteOption('after_sport', ms: 'Selepas sukan', en: 'After sport', zh: '运动后', ta: 'விளையாட்டு பிறகு'),
  TasteOption('night_shift', ms: 'Syif malam', en: 'Night shift', zh: '夜班', ta: 'இரவு பணி'),
  TasteOption('quick_work_break', ms: 'Rehat kerja pantas', en: 'Quick work break', zh: '工作小憩', ta: 'விரைவு இடைவேளை'),
  TasteOption('family_meal', ms: 'Makan keluarga', en: 'Family meal', zh: '家庭聚餐', ta: 'குடும்ப உணவு'),
  TasteOption('group_meal', ms: 'Makan ramai', en: 'Group meal', zh: '聚餐', ta: 'குழு உணவு'),
  TasteOption('solo_meal', ms: 'Makan sendiri', en: 'Solo meal', zh: '独自用餐', ta: 'தனி உணவு'),
  TasteOption('celebration', ms: 'Sambutan', en: 'Celebration', zh: '庆祝', ta: 'கொண்டாட்டம்'),
  TasteOption('custom', ms: 'Tersendiri', en: 'Custom', zh: '自定义', ta: 'தனிப்பயன்'),
];

// ============================================================
// 10. PRESET BAJET & JARAK (Seksyen 17-18) — pembantu paparan;
//     sumber kebenaran kekal NUMERIK (budgetMin/Max, radiusKm).
// ============================================================
const List<TasteOption> kBudgetPresets = [
  TasteOption('under_rm10', ms: 'Bawah RM10', en: 'Under RM10', zh: 'RM10 以下', ta: 'RM10-க்கு கீழ்'),
  TasteOption('rm10_to_rm15', ms: 'RM10–RM15', en: 'RM10–RM15', zh: 'RM10–RM15', ta: 'RM10–RM15'),
  TasteOption('rm15_to_rm25', ms: 'RM15–RM25', en: 'RM15–RM25', zh: 'RM15–RM25', ta: 'RM15–RM25'),
  TasteOption('rm25_to_rm40', ms: 'RM25–RM40', en: 'RM25–RM40', zh: 'RM25–RM40', ta: 'RM25–RM40'),
  TasteOption('rm40_to_rm60', ms: 'RM40–RM60', en: 'RM40–RM60', zh: 'RM40–RM60', ta: 'RM40–RM60'),
  TasteOption('above_rm60', ms: 'Atas RM60', en: 'Above RM60', zh: 'RM60 以上', ta: 'RM60-க்கு மேல்'),
  TasteOption('custom', ms: 'Tersendiri', en: 'Custom', zh: '自定义', ta: 'தனிப்பயன்'),
];
const List<TasteOption> kDistancePresets = [
  TasteOption('under_1km', ms: 'Bawah 1 km', en: 'Under 1 km', zh: '1公里内', ta: '1கிமீ-க்கு கீழ்'),
  TasteOption('up_to_3km', ms: 'Hingga 3 km', en: 'Up to 3 km', zh: '3公里内', ta: '3கிமீ வரை'),
  TasteOption('up_to_5km', ms: 'Hingga 5 km', en: 'Up to 5 km', zh: '5公里内', ta: '5கிமீ வரை'),
  TasteOption('up_to_10km', ms: 'Hingga 10 km', en: 'Up to 10 km', zh: '10公里内', ta: '10கிமீ வரை'),
  TasteOption('up_to_20km', ms: 'Hingga 20 km', en: 'Up to 20 km', zh: '20公里内', ta: '20கிமீ வரை'),
  TasteOption('any_distance', ms: 'Mana-mana jarak', en: 'Any distance', zh: '任何距离', ta: 'எந்த தூரமும்'),
  TasteOption('custom', ms: 'Tersendiri', en: 'Custom', zh: '自定义', ta: 'தனிப்பயன்'),
];

// ============================================================
// 11. IMBANGAN MAKAN / FREKUENSI (Seksyen 19).
// ============================================================
const List<TasteOption> kMealBalanceDimensions = [
  TasteOption('healthy_light_meals', ms: 'Makanan sihat & ringan', en: 'Healthy light meals', zh: '健康清淡餐', ta: 'ஆரோக்கிய இலகு உணவு'),
  TasteOption('balanced_meals', ms: 'Makanan seimbang', en: 'Balanced meals', zh: '均衡餐', ta: 'சமச்சீர் உணவு'),
  TasteOption('rich_heavy_meals', ms: 'Makanan berat', en: 'Rich heavy meals', zh: '丰盛重口', ta: 'நிறைவான உணவு'),
  TasteOption('treats_desserts', ms: 'Manisan & pencuci mulut', en: 'Treats & desserts', zh: '甜品', ta: 'இனிப்பு வகை'),
];
const List<TasteOption> kFrequencyLevels = [
  TasteOption('rarely', ms: 'Jarang', en: 'Rarely', zh: '很少', ta: 'அரிதாக'),
  TasteOption('sometimes', ms: 'Kadang-kadang', en: 'Sometimes', zh: '有时', ta: 'சில நேரம்'),
  TasteOption('often', ms: 'Kerap', en: 'Often', zh: '经常', ta: 'அடிக்கடி'),
  TasteOption('most_of_the_time', ms: 'Kebanyakan masa', en: 'Most of the time', zh: '大部分时间', ta: 'பெரும்பாலும்'),
];

// ============================================================
// 12. TOLERANSI ULANG & TAHAP TEROKA (Seksyen 20-21).
// ============================================================
const List<TasteOption> kRepeatTolerance = [
  TasteOption('repeat_favourites', ms: 'Ulang kegemaran', en: 'Repeat favourites', zh: '重复最爱', ta: 'பிடித்ததை மீண்டும்'),
  TasteOption('balanced_repeat_and_new', ms: 'Seimbang lama & baru', en: 'Balance familiar & new', zh: '熟悉与新平衡', ta: 'பழக்கம் & புதியது'),
  TasteOption('mostly_new', ms: 'Kebanyakan baru', en: 'Mostly new', zh: '多数新品', ta: 'பெரும்பாலும் புதியது'),
  TasteOption('avoid_recent_repeats', ms: 'Elak yang baru dimakan', en: 'Avoid recent repeats', zh: '避免近期重复', ta: 'சமீபத்தியதை தவிர்'),
];
const List<TasteOption> kDiscoveryLevels = [
  TasteOption('familiar_only', ms: 'Yang biasa sahaja', en: 'Familiar only', zh: '仅熟悉', ta: 'பழக்கமானது மட்டும்'),
  TasteOption('slightly_adventurous', ms: 'Sedikit berani', en: 'Slightly adventurous', zh: '略微尝新', ta: 'சற்று துணிச்சல்'),
  TasteOption('adventurous', ms: 'Suka mencuba', en: 'Adventurous', zh: '爱尝新', ta: 'துணிச்சலான'),
  TasteOption('surprise_me', ms: 'Kejutkan saya', en: 'Surprise me', zh: '给我惊喜', ta: 'எனை ஆச்சரியப்படுத்து'),
];

// ============================================================
// 13. PENAFIAN KESELAMATAN (Seksyen 29) — 4 bahasa, bukan nasihat perubatan.
// ============================================================
/// Penafian alahan — WAJIB dipapar dekat pemilihan alahan.
const Map<String, String> kAllergyDisclaimer = {
  'ms': 'MakanMana tidak dapat menjamin penyediaan bebas alergen atau '
      'mengelakkan pencemaran silang. Sila sahkan bahan dan penyediaan '
      'terus dengan restoran.',
  'en': 'MakanMana cannot guarantee allergen-free preparation or prevent '
      'cross-contamination. Verify ingredients and preparation directly '
      'with the restaurant.',
  'zh': 'MakanMana 无法保证无过敏原烹调或避免交叉污染。请直接向餐厅确认食材与'
      '制备方式。',
  'ta': 'MakanMana ஒவ்வாமை இல்லா தயாரிப்பை உறுதி செய்யவோ குறுக்கு மாசுபாட்டை '
      'தடுக்கவோ முடியாது. பொருட்கள் மற்றும் தயாரிப்பை உணவகத்துடன் நேரடியாக '
      'உறுதிப்படுத்தவும்.',
};

/// Penafian diet/kesihatan — untuk peribadikan sahaja, bukan nasihat perubatan.
const Map<String, String> kDietDisclaimer = {
  'ms': 'Keutamaan diet dan kesihatan digunakan untuk peribadikan sahaja '
      'dan bukan nasihat perubatan.',
  'en': 'Diet and health preferences are used for personalization only and '
      'are not medical advice.',
  'zh': '饮食与健康偏好仅用于个性化推荐，并非医疗建议。',
  'ta': 'உணவு மற்றும் ஆரோக்கிய விருப்பங்கள் தனிப்பயனாக்கத்திற்கு மட்டுமே; '
      'இவை மருத்துவ ஆலோசனை அல்ல.',
};

/// Semua senarai kanonikal (untuk ujian keunikan ID & parity 4-bahasa).
const Map<String, List<TasteOption>> kAllTasteLists = {
  'foodGoal': kFoodGoals,
  'halal': kHalalOptions,
  'diet': kDietPatterns,
  'allergenCommon': kAllergensCommon,
  'allergenLocal': kAllergensLocal,
  'allergenOther': kAllergensOther,
  'allergySeverity': kAllergySeverity,
  'spice': kSpiceLevels,
  'taste': kTastePreferences,
  'mealTime': kMealTimes,
  'mealContext': kMealContexts,
  'budgetPreset': kBudgetPresets,
  'distancePreset': kDistancePresets,
  'mealBalance': kMealBalanceDimensions,
  'frequency': kFrequencyLevels,
  'repeat': kRepeatTolerance,
  'discovery': kDiscoveryLevels,
};
