import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/constants/app_constants.dart';
import '../core/widgets/placeholder_screen.dart';
import '../features/admin/admin_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/explore/explore_screen.dart';
import '../features/fit/fit_extras_screens.dart';
import '../features/fit/fit_monitor_screen.dart';
import '../features/fit/fit_onboarding_screen.dart';
import '../features/fit/fit_today_screen.dart';
import '../features/fit/sport_moods_screen.dart';
import '../features/history/history_screen.dart';
import '../features/home/home_screen.dart';
import '../features/language/language_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/paywall/paywall_screen.dart';
import '../features/privacy/privacy_screen.dart';
import '../features/pro/calorie_scan_screen.dart';
import '../features/pro/coach_screen.dart';
import '../features/pro/diet_goal_screen.dart';
import '../features/pro/group_decision_screen.dart';
import '../features/pro/meal_plan_screen.dart';
import '../features/pro/pro_hub_screen.dart';
import '../features/pro/weekly_report_screen.dart';
import '../features/profile/edit_profile_screen.dart';
import '../features/profile/extras_screens.dart';
import '../features/profile/profile_screen.dart';
import '../features/restaurant/restaurant_detail_screen.dart';
import '../features/reviews/rating_page.dart';
import '../features/settings/settings_screen.dart';
import '../features/shell/app_shell.dart';
import '../features/groups/group_bills_screen.dart';
import '../features/groups/group_hub_screen.dart';
import '../features/groups/group_settings_screen.dart';
import '../features/social/compose_sheet.dart';
import '../features/social/edit_food_profile_screen.dart';
import '../features/social/feed_screen.dart';
import '../features/social/follow_list_screen.dart';
import '../features/social/food_profile_screen.dart';
import '../features/social/my_activity_screen.dart';
import '../features/tongtong/tongtong_screens.dart';
import '../features/wallet/wallet_models.dart';
import '../features/wallet/wallet_screens.dart';
import '../features/splash/splash_screen.dart';
import '../features/suggestions/suggestion_screen.dart';
import '../features/theme_picker/theme_picker_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: RoutePaths.splash,
    routes: [
      GoRoute(
        path: RoutePaths.splash,
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(
        path: RoutePaths.language,
        builder: (context, state) => const LanguageScreen(),
      ),
      GoRoute(
        path: RoutePaths.login,
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: RoutePaths.onboarding,
        builder: (context, state) => const OnboardingScreen(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(
              path: RoutePaths.home,
              builder: (context, state) => const HomeScreen(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: RoutePaths.explore,
              builder: (context, state) => const ExploreScreen(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: RoutePaths.history,
              builder: (context, state) => const HistoryScreen(),
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: RoutePaths.profile,
              builder: (context, state) => const ProfileScreen(),
            ),
          ]),
        ],
      ),
      GoRoute(
        path: RoutePaths.suggestion,
        builder: (context, state) => const SuggestionScreen(),
      ),
      GoRoute(
        path: RoutePaths.restaurant,
        builder: (context, state) => RestaurantDetailScreen(
          placeId: state.pathParameters['placeId'] ?? '',
        ),
      ),
      GoRoute(
        path: RoutePaths.paywall,
        builder: (context, state) => const PaywallScreen(),
      ),
      GoRoute(
        path: RoutePaths.themePicker,
        builder: (context, state) => const ThemePickerScreen(),
      ),
      GoRoute(
        path: RoutePaths.privacy,
        builder: (context, state) => const PrivacyScreen(),
      ),
      GoRoute(
        path: RoutePaths.settings,
        builder: (context, state) => const SettingsScreen(),
      ),
      GoRoute(
        path: RoutePaths.fitToday,
        builder: (context, state) => const FitTodayScreen(),
      ),
      GoRoute(
        path: RoutePaths.fitMonitor,
        builder: (context, state) => const FitMonitorScreen(),
      ),
      GoRoute(
        path: RoutePaths.fitOnboarding,
        builder: (context, state) => const FitOnboardingScreen(),
      ),
      GoRoute(
        path: RoutePaths.fitSportMoods,
        builder: (context, state) => const SportMoodsScreen(),
      ),
      GoRoute(
        path: RoutePaths.fitReports,
        builder: (context, state) => const FitReportsScreen(),
      ),
      GoRoute(
        path: RoutePaths.fitWearables,
        builder: (context, state) => const FitWearablesScreen(),
      ),
      GoRoute(
        path: RoutePaths.fitHealthPermissions,
        builder: (context, state) => const HealthPermissionsScreen(),
      ),
      // V4: Meal Wallet.
      GoRoute(
        path: RoutePaths.mealWallet,
        builder: (context, state) => const MealWalletScreen(),
      ),
      GoRoute(
        path: RoutePaths.mealWalletAdd,
        builder: (context, state) {
          final extra = state.extra as Map<String, String?>?;
          return AddExpenseScreen(
            placeId: extra?['placeId'],
            placeName: extra?['placeName'],
          );
        },
      ),
      GoRoute(
        path: RoutePaths.mealWalletBudget,
        builder: (context, state) => const BudgetSettingsScreen(),
      ),
      // V4: Tong-Tong Bill.
      GoRoute(
        path: RoutePaths.tongTong,
        builder: (context, state) => const TongTongListScreen(),
      ),
      GoRoute(
        path: RoutePaths.tongTongCreate,
        builder: (context, state) =>
            CreateBillScreen(seed: state.extra as MealExpense?),
      ),
      GoRoute(
        path: '/tong-tong/:billId',
        builder: (context, state) =>
            BillDetailScreen(billId: state.pathParameters['billId'] ?? ''),
      ),
      // V4: My Activity.
      GoRoute(
        path: RoutePaths.myActivity,
        builder: (context, state) => const MyActivityScreen(),
      ),
      // Laluan placeholder masa depan - jangan bina penuh dalam V1 awal.
      GoRoute(
        path: RoutePaths.nutrition,
        builder: (context, state) =>
            const PlaceholderScreen(title: 'Nutrition', emoji: '🥦'),
      ),
      GoRoute(
        path: RoutePaths.social,
        builder: (context, state) => const FeedScreen(),
      ),
      GoRoute(
        path: '/compose',
        builder: (context, state) =>
            ComposePage(groupId: state.uri.queryParameters['groupId']),
      ),
      GoRoute(
        path: '/rate',
        builder: (context, state) =>
            RatingPage(args: state.extra! as RatingArgs),
      ),
      GoRoute(
        path: '/edit-profile',
        builder: (context, state) => const EditProfileScreen(),
      ),
      GoRoute(
        path: '/admin',
        builder: (context, state) => const AdminScreen(),
      ),
      GoRoute(
        path: '/favorites',
        builder: (context, state) => const FavoritesScreen(),
      ),
      GoRoute(
        path: '/taste',
        builder: (context, state) => const TasteProfileScreen(),
      ),
      GoRoute(
        path: '/food-memory',
        builder: (context, state) => const FoodMemoryScreen(),
      ),
      GoRoute(
        path: '/help',
        builder: (context, state) => const HelpScreen(),
      ),
      // Pro Tools 👑 (Milestone 5+).
      GoRoute(
        path: '/pro',
        builder: (context, state) => const ProHubScreen(),
      ),
      GoRoute(
        path: '/pro/report',
        builder: (context, state) => const WeeklyReportScreen(),
      ),
      GoRoute(
        path: '/pro/coach',
        builder: (context, state) => const CoachScreen(),
      ),
      GoRoute(
        path: '/pro/diet-goal',
        builder: (context, state) => const DietGoalScreen(),
      ),
      GoRoute(
        path: '/pro/meal-plan',
        builder: (context, state) => const MealPlanScreen(),
      ),
      GoRoute(
        path: '/pro/scan',
        builder: (context, state) => const CalorieScanScreen(),
      ),
      GoRoute(
        path: '/group-decision',
        builder: (context, state) => const GroupDecisionScreen(),
      ),
      GoRoute(
        path: '/group-vote',
        builder: (context, state) =>
            GroupVoteScreen(sessionId: state.extra! as String),
      ),
      GoRoute(
        path: RoutePaths.group,
        builder: (context, state) =>
            const PlaceholderScreen(title: 'Group Makan', emoji: '🍽️'),
      ),
      // ---------- V4 Social: profil makanan awam + follow ----------
      GoRoute(
        path: RoutePaths.editFoodProfile,
        builder: (context, state) => const EditFoodProfileScreen(),
      ),
      GoRoute(
        path: '/u/:uid',
        builder: (context, state) =>
            FoodProfileScreen(uid: state.pathParameters['uid'] ?? ''),
      ),
      GoRoute(
        path: '/u/:uid/followers',
        builder: (context, state) => FollowListScreen(
          uid: state.pathParameters['uid'] ?? '',
          mode: 'followers',
        ),
      ),
      GoRoute(
        path: '/u/:uid/following',
        builder: (context, state) => FollowListScreen(
          uid: state.pathParameters['uid'] ?? '',
          mode: 'following',
        ),
      ),
      // ---------- V4 Group Hub ----------
      // Susunan penting: laluan statik sebelum :groupId.
      GoRoute(
        path: '/groups/:groupId/settings',
        builder: (context, state) => GroupSettingsScreen(
            groupId: state.pathParameters['groupId'] ?? ''),
      ),
      GoRoute(
        path: '/groups/:groupId/bills/create',
        builder: (context, state) => GroupCreateBillScreen(
            groupId: state.pathParameters['groupId'] ?? ''),
      ),
      GoRoute(
        path: '/groups/:groupId',
        builder: (context, state) =>
            GroupHubScreen(groupId: state.pathParameters['groupId'] ?? ''),
      ),
    ],
  );
});
