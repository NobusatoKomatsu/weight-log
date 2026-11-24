package blue.application.check

import android.app.AlertDialog
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.BaseAdapter
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.google.android.gms.ads.MobileAds
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

const val PRIVACY_URL = "https://application.blue/privacy"

class MainActivity : ComponentActivity() {

    private val io = Executors.newSingleThreadExecutor()
    private lateinit var store: Store

    private var rows: List<AppRow> = emptyList()
    private var icons: Map<String, Drawable> = emptyMap()
    private var hasUsage = false
    private var loaded = false
    private var filter = Filter.ALL
    private var confirmed: Set<String> = emptySet()
    private var fresh: Set<String> = emptySet()
    private var judged: List<Judged> = emptyList()
    /** false＝気になる順の点検、true＝種類ごとの整理 */
    private var byGroup = false
    private var groupOverrides: Map<String, Group> = emptyMap()

    /** 削除の確認画面を出しているアプリ */
    private var deleting: AppRow? = null

    private lateinit var summary: TextView
    private lateinit var usageBanner: View
    private lateinit var newBanner: View
    private lateinit var newBannerText: TextView
    private lateinit var empty: TextView
    private lateinit var list: ListView
    private val filterChips = LinkedHashMap<Filter, TextView>()
    private lateinit var checkTab: TextView
    private lateinit var groupTab: TextView
    private lateinit var planButton: TextView
    private lateinit var hint: TextView
    private val adapter = RowAdapter()
    private var adView: AdView? = null

    private val uninstaller =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { afterUninstall() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        store = Store(this)
        groupOverrides = store.groups
        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(buildUi())
        render()
    }

    override fun onResume() {
        super.onResume()
        adView?.resume()
        reload()
    }

    override fun onPause() {
        adView?.pause()
        super.onPause()
    }

    override fun onDestroy() {
        adView?.destroy()
        super.onDestroy()
        io.shutdownNow()
    }

    // ---------- 画面 ----------

    private fun buildUi(): View {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            padForSystemBars()
        }

        root.addView(TextView(this).apply {
            text = "アプリ整理"
            textSize = 24f
            setTextColor(INK)
            setTypeface(Typeface.DEFAULT, Typeface.BOLD)
            setPadding(dp(20), dp(16), dp(20), 0)
        })
        summary = TextView(this).apply {
            textSize = 14f
            setTextColor(SUB)
            setPadding(dp(20), dp(2), dp(20), dp(10))
        }
        root.addView(summary)

        usageBanner = banner(
            "「使用状況へのアクセス」を許可すると、最後に使った日と、データを含めた容量が分かり、" +
                "使っていないアプリを見分けられます。調べた内容は端末の外には送りません。",
            listOf("許可する（一覧から「アプリ整理」を選ぶ）" to { openUsageSettings() }),
        )
        root.addView(usageBanner, margins(dp(16), 0, dp(16), dp(10)))

        newBannerText = TextView(this).apply {
            textSize = 15f
            setTextColor(INK)
            setTypeface(Typeface.DEFAULT, Typeface.BOLD)
        }
        newBanner = banner(
            null,
            listOf(
                "増えたアプリだけ見る" to { filter = Filter.NEW; render(); list.setSelection(0) },
                "見たことにする" to { markAllSeen() },
            ),
            head = newBannerText,
        )
        root.addView(newBanner, margins(dp(16), 0, dp(16), dp(10)))

        checkTab = chip("気になる順に点検") { byGroup = false; render(); list.setSelection(0) }
        groupTab = chip("種類ごとに整理") { byGroup = true; render(); list.setSelection(0) }
        root.addView(chipRow(listOf(checkTab, groupTab)))

        for (f in listOf(Filter.ALL, Filter.BAD, Filter.ASK, Filter.OK, Filter.NEW)) {
            filterChips[f] = chip("") { filter = f; render(); list.setSelection(0) }
        }
        root.addView(chipRow(filterChips.values.toList()))

        list = ListView(this).apply {
            adapter = this@MainActivity.adapter
            divider = null
            clipToPadding = false
            setPadding(0, dp(2), 0, dp(8))
            setOnItemClickListener { _, _, pos, _ ->
                (this@MainActivity.adapter.getItem(pos) as? Judged)?.let { showDetail(it) }
            }
        }
        empty = TextView(this).apply {
            textSize = 15f
            setTextColor(SUB)
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(24), dp(24), dp(24))
        }
        root.addView(list, LinearLayout.LayoutParams(-1, 0, 1f))
        root.addView(empty, LinearLayout.LayoutParams(-1, 0, 1f))

        planButton = TextView(this).apply {
            text = "ホーム画面の並べ方の案を見る"
            textSize = 15f
            setTypeface(Typeface.DEFAULT, Typeface.BOLD)
            setTextColor(CARD)
            gravity = Gravity.CENTER
            background = roundRect(ACCENT, dp(22).toFloat())
            setPadding(dp(12), dp(11), dp(12), dp(11))
            setOnClickListener { showHomePlan() }
        }
        root.addView(planButton, margins(dp(16), dp(6), dp(16), 0))

        hint = TextView(this).apply {
            textSize = 12f
            setTextColor(SUB)
            gravity = Gravity.CENTER
            setPadding(dp(16), dp(6), dp(16), 0)
        }
        root.addView(hint)
        root.addView(TextView(this).apply {
            text = "プライバシーポリシー"
            textSize = 12f
            setTextColor(SUB)
            gravity = Gravity.CENTER
            setPadding(dp(16), dp(6), dp(16), dp(10))
            setOnClickListener { openUrl(PRIVACY_URL) }
        })

        addAdBanner(root)
        return root
    }

    /** 枠つきのお知らせ。下に、押せる文字を横に並べる */
    private fun banner(message: String?, actions: List<Pair<String, () -> Unit>>, head: TextView? = null): View =
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = roundRect(CARD, dp(14).toFloat(), dp(2), ACCENT)
            setPadding(dp(14), dp(12), dp(14), dp(8))
            if (head != null) addView(head)
            if (message != null) addView(TextView(context).apply {
                text = message
                textSize = 14f
                setTextColor(INK)
            })
            addView(LinearLayout(context).apply {
                orientation = LinearLayout.HORIZONTAL
                for ((label, action) in actions) addView(TextView(context).apply {
                    text = label
                    textSize = 15f
                    setTypeface(Typeface.DEFAULT, Typeface.BOLD)
                    setTextColor(ACCENT)
                    setPadding(0, dp(10), dp(22), dp(6))
                    setOnClickListener { action() }
                })
            })
        }

    /** 一番下の広告。広告が読み込まれたときに一覧が動かないよう、先に高さを確保しておく */
    private fun addAdBanner(root: LinearLayout) {
        try {
            val widthDp = (resources.displayMetrics.widthPixels / resources.displayMetrics.density).toInt()
            val size = AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(this, widthDp)
            root.addView(View(this).apply { setBackgroundColor(LINE) }, LinearLayout.LayoutParams(-1, dp(1)))
            val box = FrameLayout(this).apply { minimumHeight = size.getHeightInPixels(context) }
            root.addView(box, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(8) })

            io.execute {
                try {
                    MobileAds.initialize(applicationContext)
                } catch (e: Throwable) {
                    return@execute
                }
                runOnUiThread {
                    if (isDestroyed) return@runOnUiThread
                    try {
                        val view = AdView(this).apply {
                            adUnitId = BuildConfig.ADMOB_BANNER_ID
                            setAdSize(size)
                        }
                        box.addView(view, FrameLayout.LayoutParams(-2, -2, Gravity.CENTER_HORIZONTAL))
                        adView = view
                        view.loadAd(AdRequest.Builder().build())
                    } catch (e: Throwable) {
                        // 広告が出せなくても、アプリはそのまま使える
                    }
                }
            }
        } catch (e: Throwable) {
            // 同上
        }
    }

    private fun chipRow(views: List<View>): View {
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), 0, dp(16), dp(8))
        }
        for ((i, v) in views.withIndex()) {
            row.addView(v, LinearLayout.LayoutParams(-2, -2).apply { if (i > 0) leftMargin = dp(8) })
        }
        return HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(row)
        }
    }

    private fun margins(l: Int, t: Int, r: Int, b: Int) =
        LinearLayout.LayoutParams(-1, -2).apply { setMargins(l, t, r, b) }

    private fun render() {
        val now = System.currentTimeMillis()
        judged = sortJudged(rows.map {
            val isNew = it.pkg in fresh
            Judged(it, judge(it, now, hasUsage, it.pkg in confirmed, isNew), isNew)
        })
        fun count(f: Filter) = judged.count { matches(it, f) }
        // 増えたアプリがなくなったら、その絞り込みのままにしない
        if (filter == Filter.NEW && count(Filter.NEW) == 0) filter = Filter.ALL
        val shown = judged.filter { matches(it, filter) }
        val items: List<Any> = if (!byGroup) shown else sections(shown, ::groupFor).flatMap { listOf<Any>(it) + it.items }
        adapter.show(items, now)
        checkTab.setChipOn(!byGroup)
        groupTab.setChipOn(byGroup)
        planButton.visibility = if (byGroup && loaded && rows.isNotEmpty()) View.VISIBLE else View.GONE
        hint.text = if (byGroup) "同じ種類のアプリを見くらべて、使っていないものを減らせます。種類は、アプリをタップして変えられます"
        else "アプリをタップすると、くわしい内容を見て「確認済み」にしたり、削除したりできます"

        for ((f, chip) in filterChips) {
            val name = when (f) {
                Filter.ALL -> "すべて"
                Filter.BAD -> Level.BAD.title()
                Filter.ASK -> Level.ASK.title()
                Filter.OK -> Level.OK.title()
                Filter.NEW -> "増えた"
            }
            chip.text = if (loaded) "$name ${count(f)}" else name
            chip.setChipOn(f == filter)
        }
        filterChips[Filter.NEW]?.visibility = if (count(Filter.NEW) > 0) View.VISIBLE else View.GONE

        usageBanner.visibility = if (loaded && !hasUsage) View.VISIBLE else View.GONE
        newBanner.visibility = if (count(Filter.NEW) > 0) View.VISIBLE else View.GONE
        newBannerText.text = "前回の点検から ${count(Filter.NEW)}個増えました"

        summary.text = when {
            !loaded -> "調べています…"
            count(Filter.BAD) + count(Filter.ASK) == 0 -> "あとから入ったアプリ ${rows.size}個 ・ 気になるものはありません"
            else -> "あとから入ったアプリ ${rows.size}個 ・ 確かめたいもの ${count(Filter.BAD) + count(Filter.ASK)}個"
        }
        empty.text = when {
            !loaded -> "調べています…"
            rows.isEmpty() -> "あとから入ったアプリはありません"
            else -> "あてはまるアプリはありません"
        }
        empty.visibility = if (shown.isEmpty()) View.VISIBLE else View.GONE
        list.visibility = if (shown.isEmpty()) View.GONE else View.VISIBLE
    }

    // ---------- 読み込み ----------

    private fun reload() {
        io.execute {
            val result = try {
                loadApps(applicationContext)
            } catch (e: Exception) {
                Loaded(emptyList(), emptyMap(), false)
            }
            runOnUiThread {
                if (isDestroyed) return@runOnUiThread
                rows = result.rows
                icons = result.icons
                hasUsage = result.hasUsage
                loaded = true

                val current = rows.map { it.pkg }.toSet()
                // なくなったアプリの覚え書きは捨てる（入れ直したら、もう一度確かめてもらう）
                confirmed = store.confirmed.intersect(current).also { if (it != store.confirmed) store.confirmed = it }
                val seen = store.seen
                if (seen == null) {
                    // 初めての点検では、いま入っているものを基準にする
                    store.seen = current
                } else if (!current.containsAll(seen)) {
                    store.seen = seen.intersect(current)
                }
                fresh = newPackages(current, seen)
                render()
            }
        }
    }

    private fun markAllSeen() {
        store.seen = rows.map { it.pkg }.toSet()
        fresh = emptySet()
        render()
    }

    private fun setConfirmed(pkg: String, on: Boolean) {
        confirmed = if (on) confirmed + pkg else confirmed - pkg
        store.confirmed = confirmed
        if (on && pkg in fresh) {
            // 確かめたアプリは、もう「増えた」に数えない
            fresh = fresh - pkg
            store.seen = (store.seen ?: emptySet()) + pkg
        }
        render()
    }

    // ---------- 種類ごとの整理 ----------

    /** 本人が変えた種類があればそれを、なければ自動で決めた種類を使う */
    private fun groupFor(row: AppRow): Group = groupOverrides[row.pkg] ?: groupOf(row)

    private fun pickGroup(row: AppRow) {
        val groups = Group.entries
        AlertDialog.Builder(this)
            .setTitle("「${row.label}」の種類")
            .setSingleChoiceItems(groups.map { it.title }.toTypedArray(), groups.indexOf(groupFor(row))) { d, which ->
                groupOverrides = groupOverrides + (row.pkg to groups[which])
                store.groups = groupOverrides
                d.dismiss()
                render()
            }
            .setNegativeButton("やめる", null)
            .show()
    }

    /**
     * ホーム画面の並べ方の案。ほかのアプリがホーム画面を並べ替えることは Android ではできないので、
     * 案を見せて、本人に手で並べてもらう
     */
    private fun showHomePlan() {
        val plan = homePlan(judged, System.currentTimeMillis(), ::groupFor)
        val body = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22), dp(6), dp(22), dp(4))
        }
        fun block(title: String, note: String?, apps: List<AppRow>, bg: Int) {
            if (apps.isEmpty()) return
            body.addView(LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                background = roundRect(bg, dp(12).toFloat())
                setPadding(dp(12), dp(10), dp(12), dp(10))
                addView(TextView(context).apply {
                    text = "$title（${apps.size}個）"
                    textSize = 15f
                    setTextColor(INK)
                    setTypeface(Typeface.DEFAULT, Typeface.BOLD)
                })
                if (note != null) addView(TextView(context).apply { text = note; textSize = 12f; setTextColor(SUB) })
                addView(TextView(context).apply {
                    text = apps.joinToString("、") { it.label }
                    textSize = 14f
                    setTextColor(INK)
                    setPadding(0, dp(4), 0, 0)
                })
            }, margins(0, dp(8), 0, 0))
        }
        body.addView(TextView(this).apply {
            text = "ホーム画面は、このアプリからは並べ替えられません。下の案を見ながら、アイコンを長押しして動かしてください。" +
                "アイコンをほかのアイコンに重ねるとフォルダになります。"
            textSize = 13f
            setTextColor(SUB)
        })
        block("1 枚目に置く", "この ${HOME_DAYS}日のうちに使ったアプリ", plan.front, Level.OK.bg())
        for ((g, apps) in plan.folders) block("フォルダ「${g.title}」", null, apps, 0xFFF1F3F5.toInt())
        block("並べる前に確かめる", "「大丈夫？」「アカンで！」のアプリ。いらなければ削除、使うなら「確認済み」に", plan.review, Level.ASK.bg())

        AlertDialog.Builder(this)
            .setTitle("ホーム画面の並べ方の案")
            .setView(ScrollView(this).apply { addView(body) })
            .setPositiveButton("閉じる", null)
            .show()
    }

    /** 許可の画面を開く前に、何を調べて何に使うのかを伝える */
    private fun openUsageSettings() {
        AlertDialog.Builder(this)
            .setTitle("使用状況へのアクセスについて")
            .setMessage(
                "許可すると、このアプリは次の情報を読み取ります。\n\n" +
                    "・各アプリを最後に使った日時\n" +
                    "・各アプリが使っている容量（本体・データ・キャッシュ）\n\n" +
                    "これらは、使っていないアプリや覚えのないアプリを一覧で見分けるためだけに使います。" +
                    "これらの情報は端末の外には送信しません（通信は広告の表示のためだけに行います）。\n\n" +
                    "次の画面で「アプリ整理」を選び、許可をオンにしてください。許可しなくてもアプリは使えます。"
            )
            .setPositiveButton("設定を開く") { _, _ ->
                try {
                    startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
                } catch (e: Exception) {
                    Toast.makeText(this, "設定 → アプリ → 特別なアプリアクセス → 使用状況へのアクセス から許可してください", Toast.LENGTH_LONG).show()
                }
            }
            .setNegativeButton("許可しない", null)
            .show()
    }

    private fun openUrl(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (e: Exception) {
            Toast.makeText(this, url, Toast.LENGTH_LONG).show()
        }
    }

    // ---------- アプリごとの詳細 ----------

    private fun showDetail(j: Judged) {
        val row = j.row
        val now = System.currentTimeMillis()
        val date = SimpleDateFormat("yyyy年M月d日", Locale.JAPAN)
        fun day(t: Long) = "${date.format(Date(t))}（${ago(t, now)}）"

        val body = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(22), dp(18), dp(22), dp(4))
        }
        body.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(ImageView(context).apply { setImageDrawable(icons[row.pkg]) }, LinearLayout.LayoutParams(dp(48), dp(48)))
            addView(TextView(context).apply {
                text = row.label
                textSize = 19f
                setTextColor(INK)
                setTypeface(Typeface.DEFAULT, Typeface.BOLD)
            }, LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(14) })
        })
        body.addView(TextView(this).apply {
            text = (listOf(j.verdict.level.title()) + j.verdict.reasons).joinToString(" ・ ")
            textSize = 14f
            setTypeface(Typeface.DEFAULT, Typeface.BOLD)
            setTextColor(j.verdict.level.ink())
            background = roundRect(j.verdict.level.bg(), dp(10).toFloat())
            setPadding(dp(12), dp(8), dp(12), dp(8))
        }, margins(0, dp(12), 0, dp(6)))

        fun fact(name: String, value: String) = body.addView(LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(6), 0, 0)
            addView(TextView(context).apply { text = name; textSize = 13f; setTextColor(SUB) }, LinearLayout.LayoutParams(dp(104), -2))
            addView(TextView(context).apply { text = value; textSize = 14f; setTextColor(INK) }, LinearLayout.LayoutParams(0, -2, 1f))
        })
        fact("入った日", day(row.installed))
        fact(
            "最後に使った日", when {
                row.lastUsed > 0 -> day(row.lastUsed)
                hasUsage -> "使用記録なし"
                else -> "分かりません（使用状況の許可が必要）"
            }
        )
        fact(
            "容量", if (hasUsage) "${sizeLabel(row.bytes)}（本体 ${sizeLabel(row.appBytes)} ・ データ ${sizeLabel(row.dataBytes)} ・ キャッシュ ${sizeLabel(row.cacheBytes)}）"
            else "本体 ${sizeLabel(row.appBytes)}（データは使用状況の許可が必要）"
        )
        fact("入手元", sourceLabel(this, row))
        fact("種類", groupFor(row).title)
        fact("パッケージ名", row.pkg)

        val dialog = AlertDialog.Builder(this)
            .setView(ScrollView(this).apply { addView(body) })
            .setNegativeButton("閉じる", null)
            .create()

        fun action(label: String, color: Int, filled: Boolean = false, onClick: () -> Unit) = body.addView(TextView(this).apply {
            text = label
            textSize = 15f
            setTypeface(Typeface.DEFAULT, Typeface.BOLD)
            gravity = Gravity.CENTER
            setTextColor(if (filled) CARD else color)
            background = if (filled) roundRect(color, dp(22).toFloat()) else roundRect(CARD, dp(22).toFloat(), dp(1), color)
            setPadding(dp(12), dp(11), dp(12), dp(11))
            setOnClickListener { dialog.dismiss(); onClick() }
        }, margins(0, dp(10), 0, 0))

        val isConfirmed = row.pkg in confirmed
        if (isConfirmed) action("「確認済み」を取り消す", ACCENT) { setConfirmed(row.pkg, false) }
        else action("確認済みにする（使っていい）", ACCENT, filled = true) { setConfirmed(row.pkg, true) }
        action("種類を変える（いま：${groupFor(row).title}）", INK) { pickGroup(row) }
        action("Play ストアのページを見る", INK) { openStorePage(row.pkg) }
        action("Android の設定で見る（権限・通知など）", INK) {
            try {
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${row.pkg}")))
            } catch (e: Exception) {
                Toast.makeText(this, "設定を開けませんでした", Toast.LENGTH_LONG).show()
            }
        }
        action("このアプリを削除する", DANGER) { uninstall(row) }

        dialog.show()
    }

    private fun openStorePage(pkg: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkg")).setPackage(PLAY_STORE))
        } catch (e: Exception) {
            openUrl("https://play.google.com/store/apps/details?id=$pkg")
        }
    }

    // ---------- 削除（1 個ずつ。確認は Android の画面が出す） ----------

    private fun uninstall(row: AppRow) {
        deleting = row
        val uri = Uri.parse("package:${row.pkg}")
        try {
            // 結果を返してもらう指定にすると、削除が終わってから戻ってくる
            @Suppress("DEPRECATION")
            uninstaller.launch(Intent(Intent.ACTION_UNINSTALL_PACKAGE, uri).putExtra(Intent.EXTRA_RETURN_RESULT, true))
        } catch (e: Exception) {
            try {
                uninstaller.launch(Intent(Intent.ACTION_DELETE, uri))
            } catch (e2: Exception) {
                deleting = null
                Toast.makeText(this, "削除の画面を開けませんでした", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun afterUninstall() {
        val row = deleting ?: return
        deleting = null
        if (!isInstalled(this, row.pkg)) {
            Toast.makeText(this, "「${row.label}」を削除しました（約 ${sizeLabel(row.bytes)} 空きました）", Toast.LENGTH_LONG).show()
        }
        reload()
    }

    // ---------- 一覧の 1 件 ----------

    private class Holder(val card: View, val icon: ImageView, val name: TextView, val why: TextView, val facts: TextView, val mark: TextView)

    private inner class RowAdapter : BaseAdapter() {
        /** Judged（アプリ）か Section（種類の見出し） */
        private var items: List<Any> = emptyList()
        private var now = 0L

        fun show(items: List<Any>, now: Long) {
            this.items = items
            this.now = now
            notifyDataSetChanged()
        }

        override fun getCount() = items.size
        override fun getItem(position: Int) = items[position]
        override fun getItemId(position: Int) = position.toLong()
        override fun getViewTypeCount() = 2
        override fun getItemViewType(position: Int) = if (items[position] is Section) 1 else 0
        override fun isEnabled(position: Int) = items[position] is Judged
        override fun areAllItemsEnabled() = false

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val item = items[position]
            if (item is Section) return header(item, convertView)
            val view = convertView ?: newRow()
            val h = view.tag as Holder
            val j = item as Judged
            val level = j.verdict.level
            h.card.background = roundRect(level.bg(), dp(14).toFloat())
            h.icon.setImageDrawable(icons[j.row.pkg])
            h.name.text = j.row.label
            h.why.text = j.verdict.reasons.joinToString(" ・ ")
            h.why.setTextColor(level.ink())
            h.why.visibility = if (j.verdict.reasons.isEmpty()) View.GONE else View.VISIBLE
            h.facts.text = factsLabel(j.row, now)
            h.mark.text = level.title()
            h.mark.setTextColor(level.ink())
            return view
        }

        /** 種類の見出し。同じ種類が 2 個以上あるときは、見くらべるよう声をかける */
        private fun header(s: Section, convertView: View?): View {
            val c = this@MainActivity
            val view = (convertView as? LinearLayout) ?: LinearLayout(c).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dp(20), dp(14), dp(20), dp(2))
                addView(TextView(c).apply { textSize = 17f; setTextColor(INK); setTypeface(Typeface.DEFAULT, Typeface.BOLD) })
                addView(TextView(c).apply { textSize = 12f; setTextColor(SUB) })
            }
            (view.getChildAt(0) as TextView).text = "${s.group.title}　${s.items.size}個 ・ ${sizeLabel(s.bytes)}"
            (view.getChildAt(1) as TextView).apply {
                text = "同じ種類が ${s.items.size}個あります（使っていない順）"
                visibility = if (s.items.size >= 2 && s.group != Group.OTHER) View.VISIBLE else View.GONE
            }
            return view
        }

        private fun newRow(): View {
            val c = this@MainActivity
            val icon = ImageView(c)
            val name = TextView(c).apply {
                textSize = 16f
                setTextColor(INK)
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
            }
            val why = TextView(c).apply {
                textSize = 13f
                setTypeface(Typeface.DEFAULT, Typeface.BOLD)
                maxLines = 2
                ellipsize = TextUtils.TruncateAt.END
            }
            val facts = TextView(c).apply {
                textSize = 12f
                setTextColor(SUB)
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
            }
            val mark = TextView(c).apply {
                textSize = 13f
                setTypeface(Typeface.DEFAULT, Typeface.BOLD)
            }
            val texts = LinearLayout(c).apply {
                orientation = LinearLayout.VERTICAL
                addView(name)
                addView(why)
                addView(facts)
            }
            val card = LinearLayout(c).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(14), dp(10), dp(14), dp(10))
                addView(icon, LinearLayout.LayoutParams(dp(42), dp(42)))
                addView(texts, LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(14); rightMargin = dp(8) })
                addView(mark)
            }
            // 色のついた札のあいだに、白いすきまを空ける
            return FrameLayout(c).apply {
                setPadding(dp(12), dp(4), dp(12), dp(4))
                addView(card, FrameLayout.LayoutParams(-1, -2))
                tag = Holder(card, icon, name, why, facts, mark)
            }
        }
    }
}
