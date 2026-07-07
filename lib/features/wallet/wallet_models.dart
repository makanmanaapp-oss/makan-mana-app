/// MakanMana V4 - Meal Wallet models (ringan, Map-based).
library;

class MealItem {
  const MealItem({
    required this.itemName,
    required this.itemType, // food|drink|dessert|add_on|service|tax|delivery|discount
    required this.price,
    this.quantity = 1,
    this.shared = false,
  });

  final String itemName;
  final String itemType;
  final double price;
  final int quantity;
  final bool shared;

  double get lineTotal =>
      itemType == 'discount' ? -price * quantity : price * quantity;

  Map<String, dynamic> toMap() => {
        'itemName': itemName,
        'itemType': itemType,
        'price': price,
        'quantity': quantity,
        'shared': shared,
      };

  static MealItem fromMap(Map<String, dynamic> m) => MealItem(
        itemName: m['itemName'] as String? ?? '',
        itemType: m['itemType'] as String? ?? 'food',
        price: (m['price'] as num?)?.toDouble() ?? 0,
        quantity: (m['quantity'] as num?)?.toInt() ?? 1,
        shared: m['shared'] == true,
      );
}

class MealExpense {
  const MealExpense({
    required this.id,
    required this.totalSpend,
    required this.dateKey, // yyyyMMdd
    this.placeId,
    this.placeNameSnapshot = '',
    this.mealType = 'lunch',
    this.paymentMethod = 'cash',
    this.items = const [],
    this.foodPhotoUrl,
    this.receiptPhotoUrl,
    this.notes,
    this.satisfactionRating,
    this.portion = 'normal',
    this.source = 'manual',
    this.isGroupMeal = false,
    this.groupBillId,
  });

  final String id;
  final double totalSpend;
  final String dateKey;
  final String? placeId;
  final String placeNameSnapshot;
  final String mealType;
  final String paymentMethod;
  final List<MealItem> items;
  final String? foodPhotoUrl;
  final String? receiptPhotoUrl;
  final String? notes;
  final int? satisfactionRating;
  final String portion;
  final String source;
  final bool isGroupMeal;
  final String? groupBillId;

  double get drinkSpend => items
      .where((i) => i.itemType == 'drink')
      .fold(0.0, (s, i) => s + i.lineTotal);

  static MealExpense fromDoc(String id, Map<String, dynamic> m) =>
      MealExpense(
        id: id,
        totalSpend: (m['totalSpend'] as num?)?.toDouble() ?? 0,
        dateKey: m['dateKey'] as String? ?? '',
        placeId: m['placeId'] as String?,
        placeNameSnapshot: m['placeNameSnapshot'] as String? ?? '',
        mealType: m['mealType'] as String? ?? 'lunch',
        paymentMethod: m['paymentMethod'] as String? ?? 'cash',
        items: ((m['items'] as List?) ?? const [])
            .map((e) => MealItem.fromMap(Map<String, dynamic>.from(e as Map)))
            .toList(),
        foodPhotoUrl: m['foodPhotoUrl'] as String?,
        receiptPhotoUrl: m['receiptPhotoUrl'] as String?,
        notes: m['notes'] as String?,
        satisfactionRating: (m['satisfactionRating'] as num?)?.toInt(),
        portion: m['portion'] as String? ?? 'normal',
        source: m['source'] as String? ?? 'manual',
        isGroupMeal: m['isGroupMeal'] == true,
        groupBillId: m['groupBillId'] as String?,
      );
}

/// Profil bajet: budget_profiles/{uid}.
class BudgetProfile {
  const BudgetProfile({
    this.dailyBudget = 40,
    this.weeklyBudget = 250,
    this.monthlyBudget = 900,
    this.budgetMode = 'balanced', // relaxed | balanced | strict
    this.alertThresholdPercent = 80,
    this.coachEnabled = true,
  });

  final double dailyBudget;
  final double weeklyBudget;
  final double monthlyBudget;
  final String budgetMode;
  final int alertThresholdPercent;
  final bool coachEnabled;

  Map<String, dynamic> toMap() => {
        'dailyBudget': dailyBudget,
        'weeklyBudget': weeklyBudget,
        'monthlyBudget': monthlyBudget,
        'currency': 'MYR',
        'budgetMode': budgetMode,
        'alertThresholdPercent': alertThresholdPercent,
        'coachEnabled': coachEnabled,
      };

  static BudgetProfile fromMap(Map<String, dynamic>? m) {
    if (m == null) return const BudgetProfile();
    double d(String k, double def) => (m[k] as num?)?.toDouble() ?? def;
    return BudgetProfile(
      dailyBudget: d('dailyBudget', 40),
      weeklyBudget: d('weeklyBudget', 250),
      monthlyBudget: d('monthlyBudget', 900),
      budgetMode: m['budgetMode'] as String? ?? 'balanced',
      alertThresholdPercent:
          (m['alertThresholdPercent'] as num?)?.toInt() ?? 80,
      coachEnabled: m['coachEnabled'] != false,
    );
  }
}

/// Ringkasan perbelanjaan dikira dari senarai expense bulan semasa.
class SpendSummary {
  const SpendSummary({
    required this.today,
    required this.week,
    required this.month,
    required this.mealCount,
    required this.drinkSpend,
    required this.byPlace,
    required this.byMealType,
    required this.mostExpensive,
  });

  final double today;
  final double week;
  final double month;
  final int mealCount;
  final double drinkSpend;
  final Map<String, double> byPlace;
  final Map<String, double> byMealType;
  final MealExpense? mostExpensive;

  double get avgPerMeal => mealCount == 0 ? 0 : month / mealCount;

  String? get topPlace {
    if (byPlace.isEmpty) return null;
    final sorted = byPlace.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));
    return sorted.first.key;
  }
}
