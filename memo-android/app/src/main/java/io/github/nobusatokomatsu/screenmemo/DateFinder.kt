package io.github.nobusatokomatsu.screenmemo

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.temporal.TemporalAdjusters

/**
 * メモの文から日付・時刻を見つける (「明日 15時」「10/31」「来週金曜の午後3時半」など)。
 * 見つかった部分を除いた残りを予定のタイトルにする。
 */
object DateFinder {

    data class Hit(val date: LocalDate, val time: LocalTime?, val title: String) {
        /** 同じ予定をもう一度聞かないための目印 */
        val key get() = "$date|${time ?: ""}|$title"

        val label: String
            get() {
                val w = "月火水木金土日"[date.dayOfWeek.value - 1]
                val d = "${date.monthValue}月${date.dayOfMonth}日($w)"
                return if (time == null) d else "$d %d:%02d".format(time.hour, time.minute)
            }
    }

    private const val WEEK = "月火水木金土日"

    private val YMD = Regex("""(\d{4})\s*[/年.-]\s*(\d{1,2})\s*[/月.-]\s*(\d{1,2})\s*日?""")
    private val MD_KANJI = Regex("""(\d{1,2})\s*月\s*(\d{1,2})\s*日""")
    private val MD_SLASH = Regex("""(?<![\d/])(\d{1,2})/(\d{1,2})(?![\d/])""")
    private val RELATIVE = Regex("""明々後日|しあさって|明後日|あさって|明日|あした|あす|今日|きょう|本日""")
    private val LATER = Regex("""(\d{1,3})\s*(日|週間)後""")
    private val WEEKDAY = Regex("""(再来週|来週|今週)?\s*の?\s*([月火水木金土日])曜日?""")
    private val DAY_ONLY = Regex("""(?<![\d月/])(\d{1,2})\s*日(?![間後分目前])""")
    private val TIME = Regex("""(午前|午後|朝|昼|夕方|夜|晩)?\s*(\d{1,2})\s*(?::\s*(\d{2})|時\s*(?:(\d{1,2})\s*分|(半))?)""")

    fun find(text: String, now: LocalDateTime = LocalDateTime.now()): Hit? {
        val s = normalize(text)
        val today = now.toLocalDate()
        val used = mutableListOf<IntRange>()

        var date: LocalDate? = null
        fun take(m: MatchResult, d: LocalDate?) {
            if (d != null && date == null) {
                date = d
                used.add(m.range)
            }
        }

        YMD.find(s)?.let { m ->
            val (y, mo, d) = m.destructured
            take(m, dateOrNull(y.toInt(), mo.toInt(), d.toInt()))
        }
        if (date == null) (MD_KANJI.find(s) ?: MD_SLASH.find(s))?.let { m ->
            val (mo, d) = m.destructured
            take(m, upcoming(today, mo.toInt(), d.toInt()))
        }
        if (date == null) RELATIVE.find(s)?.let { m ->
            val add = when (m.value) {
                "明々後日", "しあさって" -> 3L
                "明後日", "あさって" -> 2L
                "明日", "あした", "あす" -> 1L
                else -> 0L
            }
            take(m, today.plusDays(add))
        }
        if (date == null) LATER.find(s)?.let { m ->
            val n = m.groupValues[1].toLong()
            take(m, if (m.groupValues[2] == "日") today.plusDays(n) else today.plusWeeks(n))
        }
        if (date == null) WEEKDAY.find(s)?.let { m ->
            val dow = DayOfWeek.of(WEEK.indexOf(m.groupValues[2]) + 1)
            val d = when (m.groupValues[1]) {
                "今週" -> today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).with(TemporalAdjusters.nextOrSame(dow))
                "来週" -> today.with(TemporalAdjusters.next(DayOfWeek.MONDAY)).with(TemporalAdjusters.nextOrSame(dow))
                "再来週" -> today.with(TemporalAdjusters.next(DayOfWeek.MONDAY)).plusWeeks(1).with(TemporalAdjusters.nextOrSame(dow))
                else -> today.with(TemporalAdjusters.nextOrSame(dow))
            }
            take(m, d)
        }
        if (date == null) DAY_ONLY.find(s)?.let { m ->
            val d = m.groupValues[1].toInt()
            // 「31日」だけなら今月、もう過ぎていれば来月
            val thisMonth = dateOrNull(today.year, today.monthValue, d)
            take(m, if (thisMonth != null && !thisMonth.isBefore(today)) thisMonth else {
                val next = today.plusMonths(1)
                dateOrNull(next.year, next.monthValue, d)
            })
        }

        var time: LocalTime? = null
        TIME.findAll(s).firstOrNull { m -> used.none { it.overlaps(m.range) } }?.let { m ->
            time = timeOf(m)
            if (time != null) used.add(m.range)
        }

        val t = time
        val day = date ?: when {
            t == null -> return null
            // 時刻だけなら、まだ来ていなければ今日、過ぎていれば明日
            t.isAfter(now.toLocalTime()) -> today
            else -> today.plusDays(1)
        }
        return Hit(day, t, titleOf(s, used))
    }

    private fun timeOf(m: MatchResult): LocalTime? {
        val part = m.groupValues[1]
        var h = m.groupValues[2].toInt()
        val min = when {
            m.groupValues[3].isNotEmpty() -> m.groupValues[3].toInt()
            m.groupValues[4].isNotEmpty() -> m.groupValues[4].toInt()
            m.groupValues[5].isNotEmpty() -> 30
            else -> 0
        }
        if (h > 24 || min > 59) return null
        when (part) {
            "午後", "夕方", "夜", "晩" -> if (h < 12) h += 12
            "午前", "朝" -> if (h == 12) h = 0
            "昼" -> if (h < 6) h += 12
            // 「3時」のように午前・午後がなければ、1〜6時は午後とみなす
            else -> if (h in 1..6) h += 12
        }
        if (h == 24) h = 0
        return LocalTime.of(h, min)
    }

    private fun titleOf(s: String, used: List<IntRange>): String {
        val sb = StringBuilder()
        s.forEachIndexed { i, c -> if (used.none { i in it }) sb.append(c) }
        val line = sb.lines()
            .map { it.replace(Regex("""\s+"""), " ").trim(' ', 'に', 'の', 'は', 'で', '、', '。', ',', '.', '　') }
            .firstOrNull { it.isNotBlank() }
        return line ?: "メモ"
    }

    private fun upcoming(today: LocalDate, month: Int, day: Int): LocalDate? {
        val d = dateOrNull(today.year, month, day) ?: return null
        return if (d.isBefore(today)) dateOrNull(today.year + 1, month, day) else d
    }

    private fun dateOrNull(y: Int, m: Int, d: Int): LocalDate? = runCatching { LocalDate.of(y, m, d) }.getOrNull()

    private fun IntRange.overlaps(o: IntRange) = first <= o.last && o.first <= last

    /** 全角の数字・記号を半角に */
    private fun normalize(t: String) = buildString {
        t.forEach { c ->
            append(
                when (c) {
                    in '０'..'９' -> '0' + (c - '０')
                    '／' -> '/'
                    '：' -> ':'
                    '－', 'ー' -> if (isNotEmpty() && last().isDigit()) '-' else c
                    else -> c
                }
            )
        }
    }
}
