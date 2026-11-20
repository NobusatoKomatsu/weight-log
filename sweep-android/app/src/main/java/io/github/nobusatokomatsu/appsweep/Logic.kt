package io.github.nobusatokomatsu.appsweep

import java.util.Locale

/** 一覧の 1 行。lastUsed は使用記録がなければ 0 */
data class AppRow(
    val pkg: String,
    val label: String,
    val lastUsed: Long,
    val installed: Long,
    val bytes: Long,
)

enum class Sort { UNUSED, SIZE, NAME }

const val DAY_MS = 24L * 60 * 60 * 1000

/** いつから使っていないか。使用記録がないアプリは、入れた日から数える（入れたばかりのアプリを巻き込まないため） */
fun AppRow.idleSince(): Long = if (lastUsed > 0) lastUsed else installed

fun sortRows(rows: List<AppRow>, sort: Sort): List<AppRow> = when (sort) {
    Sort.UNUSED -> rows.sortedWith(compareBy<AppRow> { it.idleSince() }.thenByDescending { it.bytes })
    Sort.SIZE -> rows.sortedWith(compareByDescending<AppRow> { it.bytes }.thenBy { it.idleSince() })
    Sort.NAME -> rows.sortedBy { it.label.lowercase(Locale.ROOT) }
}

/** この days 日のあいだに使ったアプリ（使用記録がないものは、入れた日で判定） */
fun recentPkgs(rows: List<AppRow>, days: Int, now: Long): Set<String> =
    rows.filter { now - it.idleSince() < days * DAY_MS }.map { it.pkg }.toSet()

/** 「3日前」「約2か月前」のような言い方 */
fun ago(t: Long, now: Long): String {
    val d = ((now - t) / DAY_MS).coerceAtLeast(0)
    return when {
        d == 0L -> "今日"
        d == 1L -> "昨日"
        d < 30 -> "${d}日前"
        d < 365 -> "約${d / 30}か月前"
        else -> "約${d / 365}年前"
    }
}

fun usageLabel(row: AppRow, now: Long, hasUsage: Boolean): String = when {
    row.lastUsed > 0 -> "最後に使用: ${ago(row.lastUsed, now)}"
    hasUsage -> "使用記録なし ・ 入れた日: ${ago(row.installed, now)}"
    else -> "入れた日: ${ago(row.installed, now)}"
}

fun sizeLabel(bytes: Long): String = when {
    bytes >= 1_000_000_000 -> String.format(Locale.ROOT, "%.1f GB", bytes / 1e9)
    bytes >= 1_000_000 -> "${bytes / 1_000_000} MB"
    else -> "${(bytes / 1000).coerceAtLeast(1)} KB"
}
