package io.github.nobusatokomatsu.appsweep

import java.util.Locale

/** 一覧の 1 行。lastUsed は使用記録がなければ 0 */
data class AppRow(
    val pkg: String,
    val label: String,
    val lastUsed: Long,
    val installed: Long,
    val bytes: Long,
    val source: Source = Source.PLAY,
)

/** どこから入ったアプリか */
enum class Source { PLAY, OTHER }

/** インストールしたアプリ（ストア）のパッケージ名から、入手元を判定する */
fun sourceOf(installer: String?): Source =
    if (installer == "com.android.vending") Source.PLAY else Source.OTHER

enum class Sort { UNUSED, NEW, SIZE, NAME }

const val DAY_MS = 24L * 60 * 60 * 1000

/** いつから使っていないか。使用記録がないアプリは、入れた日から数える（入れたばかりのアプリを巻き込まないため） */
fun AppRow.idleSince(): Long = if (lastUsed > 0) lastUsed else installed

fun sortRows(rows: List<AppRow>, sort: Sort): List<AppRow> = when (sort) {
    Sort.UNUSED -> rows.sortedWith(compareBy<AppRow> { it.idleSince() }.thenByDescending { it.bytes })
    Sort.NEW -> rows.sortedWith(compareByDescending<AppRow> { it.installed }.thenBy { it.label.lowercase(Locale.ROOT) })
    Sort.SIZE -> rows.sortedWith(compareByDescending<AppRow> { it.bytes }.thenBy { it.idleSince() })
    Sort.NAME -> rows.sortedBy { it.label.lowercase(Locale.ROOT) }
}

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

/**
 * 一覧の 2 行目に出す説明。newestFirst（新しい順）のときは、入った日を先に、必ず出す。
 * Google Play 以外から入ったアプリには、その旨を付ける（入れた覚えのないアプリを見つけやすくするため）
 */
fun usageLabel(row: AppRow, now: Long, hasUsage: Boolean, newestFirst: Boolean = false): String {
    val added = "追加: ${ago(row.installed, now)}"
    val used = when {
        row.lastUsed > 0 -> "最後に使用: ${ago(row.lastUsed, now)}"
        hasUsage -> "使用記録なし"
        else -> null
    }
    val base = when {
        used == null -> added
        // 1 行に収まるよう、こちらでは「最後に」を省く
        newestFirst && row.lastUsed > 0 -> "$added ・ 使用: ${ago(row.lastUsed, now)}"
        newestFirst -> "$added ・ $used"
        row.lastUsed > 0 -> used
        else -> "$used ・ $added"
    }
    return if (row.source == Source.OTHER) "$base ・ Play 以外" else base
}

fun sizeLabel(bytes: Long): String = when {
    bytes >= 1_000_000_000 -> String.format(Locale.ROOT, "%.1f GB", bytes / 1e9)
    bytes >= 1_000_000 -> "${bytes / 1_000_000} MB"
    else -> "${(bytes / 1000).coerceAtLeast(1)} KB"
}
