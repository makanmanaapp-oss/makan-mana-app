class AppConstants {
  AppConstants._();

  static const appName = 'MakanMana';
  static const packageName = 'com.makanmana.apps';
  static const defaultLanguage = 'ms';
  static const supportedLanguages = ['ms', 'en', 'zh', 'ta'];
  static const functionsRegion = 'asia-southeast1';
}

class RoutePaths {
  RoutePaths._();

  static const splash = '/splash';
  static const language = '/language';
  static const login = '/login';
  static const onboarding = '/onboarding';
  static const home = '/home';
  static const suggestion = '/suggestion';
  static const restaurant = '/restaurant/:placeId';
  static const history = '/history';
  static const explore = '/explore';
  static const profile = '/profile';
  static const paywall = '/paywall';
  static const themePicker = '/theme-picker';
  static const privacy = '/privacy';
  static const settings = '/settings';
  static const fitToday = '/fit/today';
  static const fitMonitor = '/fit/monitor';
  static const fitOnboarding = '/fit/onboarding';
  static const fitSportMoods = '/fit/sport-moods';
  static const fitReports = '/fit/reports';
  static const fitWearables = '/fit/wearables';
  static const fitHealthPermissions = '/fit/health-permissions';
  // V4: Meal Wallet + Tong-Tong + My Activity
  static const mealWallet = '/meal-wallet';
  static const mealWalletAdd = '/meal-wallet/add';
  static const mealWalletBudget = '/meal-wallet/budget';
  static const tongTong = '/tong-tong';
  static const tongTongCreate = '/tong-tong/create';
  static const myActivity = '/profile/activity';
  // V4 Social + Group Hub
  static const editFoodProfile = '/edit-food-profile';
  // Prompt 3: Profile Makanan hub + editor
  static const profileMakanan = '/profile-makanan';
  static const pmDietAllergy = '/pm/diet-allergy';
  static const pmBudgetRadius = '/pm/budget-radius';
  static const pmCuisine = '/pm/cuisine';
  static const pmSpice = '/pm/spice';
  static const pmMealTime = '/pm/meal-time';
  // Placeholder masa depan
  static const nutrition = '/nutrition';
  // PART 1 Phase 1.11 — sejarah laporan/pembetulan pelapor.
  static const placeReports = '/profile/place-reports';
  static const social = '/social';
  static const group = '/group';
  // Front Page Redesign 1 — Notification Center.
  static const notifications = '/notifications';
}
