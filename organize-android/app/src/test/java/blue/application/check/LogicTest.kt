package blue.application.check

import org.junit.Assert.assertEquals
import org.junit.Test

class LogicTest {
    private val now = 1_800_000_000_000L
    private fun daysAgo(d: Int) = now - d * DAY_MS

    private val daily = AppRow("daily", "apple", daysAgo(2), daysAgo(400), 900_000_000)
    private val idle = AppRow("idle", "Zebra", daysAgo(200), daysAgo(900), 5_000_000)
    private val neverPlay = AppRow("neverPlay", "Mango", 0, daysAgo(2), 50_000_000)
    private val neverSide = AppRow("neverSide", "banana", 0, daysAgo(3), 2_000_000, installer = null)
    private val usedSide = AppRow("usedSide", "Cherry", daysAgo(1), daysAgo(50), 2_000_000, installer = "com.example.store")

    private fun j(r: AppRow, hasUsage: Boolean = true, confirmed: Boolean = false, isNew: Boolean = false) =
        judge(r, now, hasUsage, confirmed, isNew)

    @Test fun recentlyUsedIsOk() {
        assertEquals(Verdict(Level.OK, listOf("最近使っている")), j(daily))
        // Play 以外でも、使っているものは OK
        assertEquals(Level.OK, j(usedSide).level)
    }

    @Test fun neverUsedOrIdleAsks() {
        assertEquals(Verdict(Level.ASK, listOf("使用記録なし")), j(neverPlay))
        assertEquals(Verdict(Level.ASK, listOf("30日以上使っていない")), j(idle))
        assertEquals(Level.OK, j(daily.copy(lastUsed = daysAgo(29))).level)
        assertEquals(Level.ASK, j(daily.copy(lastUsed = daysAgo(30))).level)
    }

    @Test fun newSinceLastCheckAsks() =
        assertEquals(Verdict(Level.ASK, listOf("前回の点検のあとに増えた")), j(daily, isNew = true))

    @Test fun sideloadedAndNeverUsedIsBad() =
        assertEquals(Verdict(Level.BAD, listOf("Play 以外から入った", "使用記録なし")), j(neverSide))

    @Test fun confirmedIsAlwaysOk() {
        assertEquals(Verdict(Level.OK, listOf("確認済み")), j(neverSide, confirmed = true, isNew = true))
    }

    @Test fun withoutUsageAccessOnlySourceAndNewCount() {
        assertEquals(Verdict(Level.OK, emptyList()), j(neverPlay, hasUsage = false))
        assertEquals(Verdict(Level.OK, emptyList()), j(idle, hasUsage = false))
        // 使用記録が分からないので、赤にはしない
        assertEquals(Verdict(Level.ASK, listOf("Play 以外から入った")), j(neverSide, hasUsage = false))
        assertEquals(Level.ASK, j(daily, hasUsage = false, isNew = true).level)
    }

    @Test fun sortsWorstFirstThenNewest() {
        val items = listOf(daily, idle, neverPlay, neverSide, usedSide).map { Judged(it, j(it), false) }
        assertEquals(listOf("neverSide", "neverPlay", "idle", "usedSide", "daily"), sortJudged(items).map { it.row.pkg })
    }

    @Test fun filters() {
        val items = listOf(daily, idle, neverSide).map { Judged(it, j(it), it.pkg == "daily") }
        fun pick(f: Filter) = items.filter { matches(it, f) }.map { it.row.pkg }
        assertEquals(listOf("daily", "idle", "neverSide"), pick(Filter.ALL))
        assertEquals(listOf("neverSide"), pick(Filter.BAD))
        assertEquals(listOf("idle"), pick(Filter.ASK))
        assertEquals(listOf("daily"), pick(Filter.OK))
        assertEquals(listOf("daily"), pick(Filter.NEW))
    }

    @Test fun newPackagesSinceLastCheck() {
        assertEquals(emptySet<String>(), newPackages(listOf("a", "b"), null))
        assertEquals(setOf("b"), newPackages(listOf("a", "b"), setOf("a", "gone")))
    }

    @Test fun wording() {
        assertEquals("追加: 約1年前 ・ 使用: 2日前 ・ 900 MB", factsLabel(daily, now))
        assertEquals("追加: 2日前 ・ 50 MB", factsLabel(neverPlay, now))
        assertEquals("今日", ago(now + 5000, now))
        assertEquals("約2年前", ago(daysAgo(800), now))
        assertEquals("1.5 GB", sizeLabel(1_540_000_000))
        assertEquals(6_000_000L, AppRow("p", "l", 0, 0, 1_000_000, 2_000_000, 3_000_000).bytes)
    }
}

class GroupTest {
    private val now = 1_800_000_000_000L
    private fun daysAgo(d: Int) = now - d * DAY_MS
    private fun app(pkg: String, label: String, used: Int? = 1, category: Int = -1) =
        AppRow(pkg, label, used?.let { daysAgo(it) } ?: 0, daysAgo(400), 1_000_000, category = category)
    private fun judged(r: AppRow) = Judged(r, judge(r, now, true, false, false), false)

    @Test fun groupsByAndroidCategoryFirst() {
        assertEquals(Group.GAME, groupOf(app("com.x.mailquest", "Mail Quest", category = 0)))
        assertEquals(Group.MAP, groupOf(app("com.x.y", "Y", category = 6)))
        assertEquals(Group.WORK, groupOf(app("com.x.y", "Y", category = 7)))
    }

    @Test fun guessesFromNames() {
        assertEquals(Group.BROWSER, groupOf(app("org.example.browser", "Surf")))
        assertEquals(Group.MONEY, groupOf(app("jp.example.app", "みらい銀行")))
        assertEquals(Group.MAP, groupOf(app("jp.example.app", "のりかえ地図")))
        assertEquals(Group.VIDEO, groupOf(app("jp.example.tv", "みるみる")))
        // 短い英語は、ほかの単語の一部には当てない（"paper" の "pay" ではない）
        assertEquals(Group.OTHER, groupOf(app("jp.example.paper", "おりがみ")))
        assertEquals(Group.OTHER, groupOf(app("jp.example.app", "ふしぎ")))
    }

    @Test fun sectionsPutBiggestGroupsFirstAndIdleAppsFirst() {
        val items = listOf(
            app("a.map1", "地図A", used = 1), app("a.map2", "地図B", used = 90), app("a.map3", "地図C", used = null),
            app("a.game", "ゲームX"), app("a.q1", "ふしぎ"), app("a.q2", "なぞ"), app("a.q3", "はてな"), app("a.q4", "ほか"),
        ).map(::judged)
        val s = sections(items, ::groupOf)
        assertEquals(listOf(Group.MAP, Group.GAME, Group.OTHER), s.map { it.group })
        assertEquals(listOf("a.map3", "a.map2", "a.map1"), s[0].items.map { it.row.pkg })
        assertEquals(3_000_000L, s[0].bytes)
    }

    @Test fun homePlanSplitsFrontFoldersAndReview() {
        val items = listOf(
            app("a.talk", "トークA", used = 0), app("a.map", "地図A", used = 3),
            app("a.game1", "ゲームB", used = 20), app("a.game2", "ゲームA", used = 10),
            app("a.old", "ふるい", used = 100), app("a.never", "しらない", used = null),
        ).map(::judged)
        val plan = homePlan(items, now, ::groupOf)
        assertEquals(listOf("a.talk", "a.map"), plan.front.map { it.pkg })
        assertEquals(listOf(Group.GAME to listOf("a.game2", "a.game1")), plan.folders.map { it.first to it.second.map { r -> r.pkg } })
        assertEquals(setOf("a.old", "a.never"), plan.review.map { it.pkg }.toSet())
    }
}
