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
    /** Android がアプリに付けている種類（ApplicationInfo.category）。付いていなければ -1 */
    val category: Int = -1,
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

// ---------- 種類ごとの整理 ----------

/** 同じような働きのアプリをまとめる種類。ホーム画面のフォルダ名にもそのまま使える名前にしている */
enum class Group(val title: String) {
    GAME("ゲーム"), SOCIAL("連絡・SNS"), VIDEO("動画"), MUSIC("音楽"), PHOTO("写真・カメラ"),
    NEWS("ニュース・本"), MAP("地図・乗り物"), SHOPPING("買い物"), MONEY("お金"),
    BROWSER("ブラウザ"), MAIL("メール"), WORK("仕事・道具"), OTHER("そのほか")
}

/** 名前に含まれていたら、その種類とみなす言葉（パッケージ名とアプリ名を小文字にして調べる） */
private val KEYWORDS: List<Pair<Group, List<String>>> = listOf(
    Group.BROWSER to listOf("browser", "chrome", "firefox", "ブラウザ"),
    Group.MAIL to listOf("mail", "メール"),
    Group.MONEY to listOf("bank", "pay", "wallet", "銀行", "家計", "証券", "ペイ", "さいふ", "財布"),
    Group.SHOPPING to listOf("shop", "store", "market", "coupon", "ショッピング", "クーポン", "通販", "フリマ"),
    Group.MAP to listOf("map", "navi", "transit", "taxi", "地図", "マップ", "乗換", "のりかえ", "ナビ"),
    Group.PHOTO to listOf("camera", "photo", "gallery", "カメラ", "写真", "フォト"),
    Group.MUSIC to listOf("music", "radio", "podcast", "音楽", "ミュージック", "ラジオ"),
    Group.VIDEO to listOf("video", "movie", "tv", "動画", "ビデオ", "テレビ"),
    Group.NEWS to listOf("news", "book", "comic", "manga", "ニュース", "新聞", "マンガ", "漫画", "読書"),
    Group.SOCIAL to listOf("chat", "talk", "messenger", "sns", "トーク", "チャット"),
    Group.GAME to listOf("game", "puzzle", "rpg", "ゲーム", "パズル"),
    Group.WORK to listOf("office", "docs", "note", "calendar", "scanner", "メモ", "カレンダー", "ツール"),
)

/**
 * アプリの種類を決める。Android が付けた種類があればそれを使い、なければ名前の言葉から推測する。
 * 推測なので外れることがある（本人があとから変えられる）
 */
fun groupOf(row: AppRow): Group {
    when (row.category) {
        0 -> return Group.GAME
        1 -> return Group.MUSIC
        2 -> return Group.VIDEO
        3 -> return Group.PHOTO
        4 -> return Group.SOCIAL
        5 -> return Group.NEWS
        6 -> return Group.MAP
    }
    val text = (row.pkg + " " + row.label).lowercase(Locale.ROOT)
    for ((group, words) in KEYWORDS) {
        // 英字の短い言葉（tv, pay など）は、ほかの単語の一部に当たらないよう、区切りで分けて調べる
        val tokens = text.split(Regex("[^a-z0-9]+"))
        if (words.any { w -> if (w.all { it in 'a'..'z' } && w.length <= 3) w in tokens else w in text }) return group
    }
    return if (row.category == 7) Group.WORK else Group.OTHER
}

/** いつから使っていないか。使用記録がないアプリは、入った日から数える */
fun AppRow.idleSince(): Long = if (lastUsed > 0) lastUsed else installed

class Section(val group: Group, val items: List<Judged>) {
    val bytes: Long get() = items.sumOf { it.row.bytes }
}

/**
 * 種類ごとにまとめる。同じ種類がたくさんあるものを上に（重なりを見つけやすくするため）、
 * 種類の中では使っていないものを上に並べる。「そのほか」は最後
 */
fun sections(items: List<Judged>, groupFor: (AppRow) -> Group): List<Section> =
    items.groupBy { groupFor(it.row) }
        .map { (g, list) -> Section(g, list.sortedBy { it.row.idleSince() }) }
        .sortedWith(compareBy<Section> { it.group == Group.OTHER }.thenByDescending { it.items.size }.thenBy { it.group.ordinal })

/** 1 枚目に置く候補にするのは、この日数のうちに使ったアプリ */
const val HOME_DAYS = 7
const val HOME_MAX = 12

/** ホーム画面の並べ方の案。front＝1 枚目に置く、folders＝種類ごとのフォルダ、review＝先に確かめる（削除を考える） */
class HomePlan(val front: List<AppRow>, val folders: List<Pair<Group, List<AppRow>>>, val review: List<AppRow>)

fun homePlan(items: List<Judged>, now: Long, groupFor: (AppRow) -> Group): HomePlan {
    val review = items.filter { it.verdict.level != Level.OK }
    val keep = items.filter { it.verdict.level == Level.OK }.map { it.row }
    val front = keep.filter { it.lastUsed > 0 && now - it.lastUsed < HOME_DAYS * DAY_MS }
        .sortedByDescending { it.lastUsed }.take(HOME_MAX)
    val rest = keep - front.toSet()
    val folders = rest.groupBy(groupFor).toList()
        .sortedWith(compareBy<Pair<Group, List<AppRow>>> { it.first == Group.OTHER }.thenBy { it.first.ordinal })
        .map { (g, list) -> g to list.sortedBy { it.label.lowercase(Locale.ROOT) } }
    return HomePlan(front, folders, sortJudged(review).map { it.row })
}
