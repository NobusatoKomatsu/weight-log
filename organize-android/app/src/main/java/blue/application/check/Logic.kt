package blue.application.check

import java.util.Locale

/** 一覧の 1 件。lastUsed は使用記録がなければ 0。installer は入れたアプリ（ストア）のパッケージ名 */
data class AppRow(
    val pkg: String,
    val label: String,
    val lastUsed: Long,
    val installed: Long,
    val appBytes: Long,
    val dataBytes: Long = 0,
    val cacheBytes: Long = 0,
    val installer: String? = PLAY_STORE,
) {
    val bytes: Long get() = appBytes + dataBytes + cacheBytes
    val fromPlay: Boolean get() = installer == PLAY_STORE
}

const val PLAY_STORE = "com.android.vending"
const val DAY_MS = 24L * 60 * 60 * 1000
/** これ以上使っていないアプリは「大丈夫？」にする */
const val IDLE_DAYS = 30

/** 点検の結果。OK＝使っていい、ASK＝大丈夫？、BAD＝アカンで！ */
enum class Level { OK, ASK, BAD }

fun Level.title(): String = when (this) {
    Level.OK -> "使っていい"
    Level.ASK -> "大丈夫？"
    Level.BAD -> "アカンで！"
}

/** 結果と、そうなった理由（事実だけ。「危険」などの評価は書かない） */
data class Verdict(val level: Level, val reasons: List<String>)

/**
 * アプリ 1 件を点検する。
 * - 本人が「確認済み」にしたものは、ほかの条件に関係なく OK
 * - Google Play 以外から入っていて、使用記録がない → BAD
 * - 使用記録がない／30 日以上使っていない／前回の点検のあとに増えた → ASK
 * 使用状況の許可がない（hasUsage が false）と使用記録は分からないので、Play 以外かどうかと、増えたかどうかだけで見る
 */
fun judge(row: AppRow, now: Long, hasUsage: Boolean, confirmed: Boolean, isNew: Boolean): Verdict {
    if (confirmed) return Verdict(Level.OK, listOf("確認済み"))

    val neverUsed = hasUsage && row.lastUsed == 0L
    val idleDays = if (row.lastUsed > 0) (now - row.lastUsed) / DAY_MS else 0
    val reasons = ArrayList<String>()
    if (isNew) reasons += "前回の点検のあとに増えた"
    if (!row.fromPlay && (neverUsed || !hasUsage)) reasons += "Play 以外から入った"
    if (neverUsed) reasons += "使用記録なし"
    if (hasUsage && idleDays >= IDLE_DAYS) reasons += "${IDLE_DAYS}日以上使っていない"

    return when {
        !row.fromPlay && neverUsed -> Verdict(Level.BAD, reasons)
        reasons.isNotEmpty() -> Verdict(Level.ASK, reasons)
        hasUsage -> Verdict(Level.OK, listOf("最近使っている"))
        else -> Verdict(Level.OK, emptyList())
    }
}

/** 一覧の絞り込み */
enum class Filter { ALL, BAD, ASK, OK, NEW }

class Judged(val row: AppRow, val verdict: Verdict, val isNew: Boolean)

fun matches(j: Judged, f: Filter): Boolean = when (f) {
    Filter.ALL -> true
    Filter.BAD -> j.verdict.level == Level.BAD
    Filter.ASK -> j.verdict.level == Level.ASK
    Filter.OK -> j.verdict.level == Level.OK
    Filter.NEW -> j.isNew
}

/** 気になるものを上に：アカンで！→ 大丈夫？→ 使っていい。同じ結果の中では、新しく入ったものから */
fun sortJudged(items: List<Judged>): List<Judged> = items.sortedWith(
    compareByDescending<Judged> { it.verdict.level.ordinal }
        .thenByDescending { it.row.installed }
        .thenBy { it.row.label.lowercase(Locale.ROOT) }
)

/** 前回の点検のあとに増えたアプリ。seen が null（初めての点検）のときは、何も「増えた」としない */
fun newPackages(current: Collection<String>, seen: Set<String>?): Set<String> =
    if (seen == null) emptySet() else current.filterNot { it in seen }.toSet()

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

/** 一覧の 3 行目：入った日・最後に使った日・容量。「使用記録なし」は理由の行に出るので、ここには書かない */
fun factsLabel(row: AppRow, now: Long): String {
    val parts = ArrayList<String>()
    parts += "追加: ${ago(row.installed, now)}"
    if (row.lastUsed > 0) parts += "使用: ${ago(row.lastUsed, now)}"
    parts += sizeLabel(row.bytes)
    return parts.joinToString(" ・ ")
}

fun sizeLabel(bytes: Long): String = when {
    bytes >= 1_000_000_000 -> String.format(Locale.ROOT, "%.1f GB", bytes / 1e9)
    bytes >= 1_000_000 -> "${bytes / 1_000_000} MB"
    else -> "${(bytes / 1000).coerceAtLeast(1)} KB"
}
