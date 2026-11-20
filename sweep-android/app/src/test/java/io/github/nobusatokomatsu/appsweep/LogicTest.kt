package io.github.nobusatokomatsu.appsweep

import org.junit.Assert.assertEquals
import org.junit.Test

class LogicTest {
    private val now = 1_800_000_000_000L
    private fun daysAgo(d: Int) = now - d * DAY_MS

    private val old = AppRow("old", "Zebra", daysAgo(200), daysAgo(900), 5_000_000)
    private val recent = AppRow("recent", "apple", daysAgo(2), daysAgo(400), 900_000_000)
    private val neverOld = AppRow("neverOld", "Mango", 0, daysAgo(500), 50_000_000)
    private val neverNew = AppRow("neverNew", "banana", 0, daysAgo(3), 2_000_000_000)
    private val all = listOf(old, recent, neverOld, neverNew)

    @Test fun sortsByUnused() =
        assertEquals(listOf("neverOld", "old", "neverNew", "recent"), sortRows(all, Sort.UNUSED).map { it.pkg })

    @Test fun sortsBySize() =
        assertEquals(listOf("neverNew", "recent", "neverOld", "old"), sortRows(all, Sort.SIZE).map { it.pkg })

    @Test fun sortsByNameIgnoringCase() =
        assertEquals(listOf("apple", "banana", "Mango", "Zebra"), sortRows(all, Sort.NAME).map { it.label })

    @Test fun picksRecentlyUsedOrNewlyInstalled() {
        assertEquals(setOf("recent", "neverNew"), recentPkgs(all, 30, now))
        assertEquals(setOf("recent", "neverNew", "old"), recentPkgs(all, 365, now))
        assertEquals(emptySet<String>(), recentPkgs(all, 2, now))
    }

    @Test fun agoWording() {
        assertEquals("今日", ago(now - 1000, now))
        assertEquals("昨日", ago(daysAgo(1), now))
        assertEquals("29日前", ago(daysAgo(29), now))
        assertEquals("約3か月前", ago(daysAgo(100), now))
        assertEquals("約2年前", ago(daysAgo(800), now))
        assertEquals("今日", ago(now + 5000, now))
    }

    @Test fun usageWording() {
        assertEquals("最後に使用: 2日前", usageLabel(recent, now, true))
        assertEquals("使用記録なし ・ 入れた日: 3日前", usageLabel(neverNew, now, true))
        assertEquals("入れた日: 3日前", usageLabel(neverNew, now, false))
    }

    @Test fun sizeWording() {
        assertEquals("1 KB", sizeLabel(10))
        assertEquals("5 MB", sizeLabel(5_000_000))
        assertEquals("2.0 GB", sizeLabel(2_000_000_000))
        assertEquals("1.5 GB", sizeLabel(1_540_000_000))
    }
}
