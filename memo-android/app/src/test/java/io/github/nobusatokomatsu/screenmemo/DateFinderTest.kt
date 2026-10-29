package io.github.nobusatokomatsu.screenmemo

import java.time.LocalDateTime
import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull

class DateFinderTest {
    // 2026-10-29 (木) 10:00
    private val now = LocalDateTime.of(2026, 10, 29, 10, 0)
    private fun f(s: String) = DateFinder.find(s, now)?.let { "${it.date} ${it.time ?: "-"} [${it.title}]" }

    @Test fun cases() {
        val cases = mapOf(
            "明日15時に歯医者" to "2026-10-30 15:00 [歯医者]",
            "あさって 3時 美容院" to "2026-10-31 15:00 [美容院]",
            "10/31 ゴミ出し" to "2026-10-31 - [ゴミ出し]",
            "１１月３日 午前10時半 会議" to "2026-11-03 10:30 [会議]",
            "金曜の夜7時 飲み会" to "2026-10-30 19:00 [飲み会]",
            "来週月曜 9:30 打合せ" to "2026-11-02 09:30 [打合せ]",
            "3日後に振込" to "2026-11-01 - [振込]",
            "2027/1/5 年始の挨拶" to "2027-01-05 - [年始の挨拶]",
            "1月10日 成人式" to "2027-01-10 - [成人式]",
            "20時に電話する" to "2026-10-29 20:00 [電話する]",
            "8時 ジョギング" to "2026-10-30 08:00 [ジョギング]",
            "31日にカード支払い" to "2026-10-31 - [カード支払い]",
            "今週土曜 掃除" to "2026-10-31 - [掃除]",
            "日曜 買い出し\n牛乳\n卵" to "2026-11-01 - [買い出し]",
        )
        val bad = cases.filter { (k, v) -> f(k) != v }.map { (k, v) -> "$k => ${f(k)} (want $v)" }
        assertEquals(emptyList<String>(), bad)
    }

    @Test fun none() {
        assertNull(f("牛乳\n卵\nパン"))
        assertNull(f("3日分の薬"))
        assertNull(f("1週間分の買い物"))
    }
}
