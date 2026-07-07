/// Slot waktu makan piawai MakanMana (dipakai oleh events, meals, AI Brain).
class TimeSlotUtils {
  TimeSlotUtils._();

  static String forHour(int hour) {
    if (hour >= 5 && hour < 11) return 'breakfast';
    if (hour >= 11 && hour < 15) return 'lunch';
    if (hour >= 15 && hour < 18) return 'tea';
    if (hour >= 18 && hour < 22) return 'dinner';
    return 'supper';
  }

  static String now() => forHour(DateTime.now().hour);

  /// Kunci dokumen daily_usage: uid_yyyyMMdd.
  static String dateKey(DateTime date) {
    final y = date.year.toString().padLeft(4, '0');
    final m = date.month.toString().padLeft(2, '0');
    final d = date.day.toString().padLeft(2, '0');
    return '$y$m$d';
  }
}
