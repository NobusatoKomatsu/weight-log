package io.github.nobusatokomatsu.appsweep

import android.app.AlertDialog
import android.content.Context
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
import android.widget.CheckBox
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ListView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.WindowCompat
import java.util.concurrent.Executors

class MainActivity : ComponentActivity() {

    private val io = Executors.newSingleThreadExecutor()
    private val prefs by lazy { getSharedPreferences("sweep", Context.MODE_PRIVATE) }

    private var rows: List<AppRow> = emptyList()
    private var icons: Map<String, Drawable> = emptyMap()
    private var hasUsage = false
    private var loaded = false
    private var sort = Sort.UNUSED
    /** 残すアプリ。ここに入っていないアプリが削除の対象 */
    private val keep = HashSet<String>()

    // 連続削除の進み具合
    private val queue = ArrayDeque<String>()
    private var current: String? = null
    private var removed = 0
    private var skipped = 0
    private var freed = 0L

    private lateinit var summary: TextView
    private lateinit var banner: View
    private lateinit var empty: TextView
    private lateinit var list: ListView
    private lateinit var deleteButton: TextView
    private val sortChips = HashMap<Sort, TextView>()
    private val adapter = RowAdapter()

    private val uninstaller =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { afterUninstall() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        keep += prefs.getStringSet("keep", emptySet()) ?: emptySet()
        setContentView(buildUi())
        render()
    }

    override fun onResume() {
        super.onResume()
        // 削除の確認画面から戻るたびに読み直さない（最後にまとめて読み直す）
        if (current == null) reload()
    }

    override fun onDestroy() {
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
            text = "アプリ一掃"
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

        banner = buildBanner()
        root.addView(banner, margins(dp(16), 0, dp(16), dp(10)))

        root.addView(chipRow(
            listOf(
                Sort.UNUSED to "使っていない順",
                Sort.SIZE to "大きい順",
                Sort.NAME to "名前順",
            ).map { (s, label) ->
                chip(label) { sort = s; render(); list.setSelection(0) }.also { sortChips[s] = it }
            }
        ))

        val pick = ArrayList<View>()
        pick += TextView(this).apply {
            text = "最近使ったものを残す"
            textSize = 13f
            setTextColor(SUB)
        }
        for ((days, label) in listOf(30 to "1か月", 90 to "3か月", 180 to "半年", 365 to "1年")) {
            pick += chip(label) { keepRecent(days, label) }
        }
        pick += chip("すべて残す") { setKeep(keep + rows.map { it.pkg }) }
        pick += chip("すべて外す") { setKeep(emptySet()) }
        root.addView(chipRow(pick))

        list = ListView(this).apply {
            adapter = this@MainActivity.adapter
            divider = null
            clipToPadding = false
            setPadding(0, dp(4), 0, dp(8))
            setOnItemClickListener { _, _, pos, _ -> toggle(this@MainActivity.adapter.getItem(pos)) }
        }
        empty = TextView(this).apply {
            textSize = 15f
            setTextColor(SUB)
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(24), dp(24), dp(24))
        }
        root.addView(list, LinearLayout.LayoutParams(-1, 0, 1f))
        root.addView(empty, LinearLayout.LayoutParams(-1, 0, 1f))

        root.addView(TextView(this).apply {
            text = "チェックを付けたアプリは残します。付けていないアプリはすべて削除します"
            textSize = 12f
            setTextColor(SUB)
            gravity = Gravity.CENTER
            setPadding(dp(16), dp(6), dp(16), 0)
        })

        deleteButton = TextView(this).apply {
            textSize = 17f
            setTypeface(Typeface.DEFAULT, Typeface.BOLD)
            setTextColor(CARD)
            gravity = Gravity.CENTER
            setPadding(dp(16), dp(15), dp(16), dp(15))
            setOnClickListener { confirmDelete() }
        }
        root.addView(deleteButton, margins(dp(16), dp(8), dp(16), dp(12)))
        return root
    }

    private fun buildBanner(): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = roundRect(0xFFFFF7E0.toInt(), dp(14).toFloat(), dp(1), 0xFFE8C766.toInt())
        setPadding(dp(14), dp(12), dp(14), dp(12))
        addView(TextView(context).apply {
            text = "「使用状況へのアクセス」を許可すると、最後に使った日と、データを含めた容量が分かります。" +
                "調べた内容は端末の外には送りません。"
            textSize = 14f
            setTextColor(INK)
        })
        addView(TextView(context).apply {
            text = "許可する（一覧から「アプリ一掃」を選ぶ）"
            textSize = 15f
            setTypeface(Typeface.DEFAULT, Typeface.BOLD)
            setTextColor(ACCENT)
            setPadding(0, dp(10), 0, dp(2))
            setOnClickListener { openUsageSettings() }
        })
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
        adapter.show(sortRows(rows, sort), now)
        for ((s, chip) in sortChips) chip.setChipOn(s == sort)
        banner.visibility = if (loaded && !hasUsage) View.VISIBLE else View.GONE

        summary.text = when {
            !loaded -> "調べています…"
            else -> "削除できるアプリ ${rows.size}個 ・ 残す ${rows.count { it.pkg in keep }}個"
        }
        val nothing = loaded && rows.isEmpty()
        empty.text = if (loaded) "削除できるアプリはありません" else "調べています…"
        empty.visibility = if (!loaded || nothing) View.VISIBLE else View.GONE
        list.visibility = if (!loaded || nothing) View.GONE else View.VISIBLE

        val picked = rows.filter { it.pkg !in keep }
        deleteButton.text = when {
            !loaded -> "調べています…"
            picked.isEmpty() -> "削除するアプリはありません"
            else -> "残す以外の ${picked.size}個を削除（${sizeLabel(picked.sumOf { it.bytes })}）"
        }
        deleteButton.isEnabled = picked.isNotEmpty()
        deleteButton.background = roundRect(if (picked.isEmpty()) OFF else DANGER, dp(26).toFloat())
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
                render()
            }
        }
    }

    private fun openUsageSettings() {
        try {
            startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
        } catch (e: Exception) {
            Toast.makeText(this, "設定 → アプリ → 特別なアプリアクセス → 使用状況へのアクセス から許可してください", Toast.LENGTH_LONG).show()
        }
    }

    // ---------- 選ぶ ----------

    private fun toggle(row: AppRow) {
        setKeep(if (row.pkg in keep) keep - row.pkg else keep + row.pkg)
    }

    private fun setKeep(pkgs: Set<String>) {
        val copy = HashSet(pkgs)
        keep.clear()
        keep += copy
        prefs.edit().putStringSet("keep", copy).apply()
        render()
    }

    private fun keepRecent(days: Int, label: String) {
        val found = recentPkgs(rows, days, System.currentTimeMillis())
        setKeep(keep + found)
        val note = if (hasUsage) "" else "（入れた日で判定）"
        Toast.makeText(
            this,
            if (found.isEmpty()) "この${label}に使ったアプリはありません$note"
            else "この${label}に使った ${found.size}個を「残す」にしました$note",
            Toast.LENGTH_SHORT,
        ).show()
    }

    // ---------- 削除 ----------

    private fun confirmDelete() {
        val picked = sortRows(rows, sort).filter { it.pkg !in keep }
        val kept = rows.size - picked.size
        if (picked.isEmpty()) return
        val names = picked.take(8).joinToString("\n") { "・${it.label}" } +
            if (picked.size > 8) "\n…ほか ${picked.size - 8}個" else ""
        AlertDialog.Builder(this)
            .setTitle("${picked.size}個のアプリを削除しますか？")
            .setMessage(
                (if (kept == 0) "⚠ 残すアプリが 1個も選ばれていません。削除できるアプリをすべて削除します。\n\n"
                else "残す ${kept}個以外を、すべて削除します。\n\n") +
                    "$names\n\nアプリのデータも消えます。Android の確認が 1個ずつ出るので、そのたびに OK を押してください。"
            )
            .setPositiveButton("削除を始める") { _, _ ->
                queue.clear()
                queue += picked.map { it.pkg }
                removed = 0
                skipped = 0
                freed = 0
                next()
            }
            .setNegativeButton("やめる", null)
            .show()
    }

    private fun next() {
        val pkg = queue.removeFirstOrNull()
        if (pkg == null) {
            finishRun()
            return
        }
        current = pkg
        val uri = Uri.parse("package:$pkg")
        try {
            // 結果を返してもらう指定にすると、削除が終わってから戻ってくる
            @Suppress("DEPRECATION")
            uninstaller.launch(Intent(Intent.ACTION_UNINSTALL_PACKAGE, uri).putExtra(Intent.EXTRA_RETURN_RESULT, true))
        } catch (e: Exception) {
            try {
                uninstaller.launch(Intent(Intent.ACTION_DELETE, uri))
            } catch (e2: Exception) {
                skipped++
                next()
            }
        }
    }

    private fun afterUninstall() {
        val pkg = current ?: return
        if (isInstalled(this, pkg)) {
            skipped++
            if (queue.isNotEmpty()) {
                AlertDialog.Builder(this)
                    .setMessage("削除しませんでした。残り ${queue.size}個を続けますか？")
                    .setPositiveButton("続ける") { _, _ -> next() }
                    .setNegativeButton("ここでやめる") { _, _ -> finishRun() }
                    .setCancelable(false)
                    .show()
                return
            }
        } else {
            removed++
            freed += rows.firstOrNull { it.pkg == pkg }?.bytes ?: 0
        }
        next()
    }

    private fun finishRun() {
        current = null
        queue.clear()
        val msg = when {
            removed == 0 -> "削除したアプリはありません"
            else -> "${removed}個を削除しました（約 ${sizeLabel(freed)} 空きました）" +
                if (skipped > 0) "\n${skipped}個は削除しませんでした" else ""
        }
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show()
        reload()
    }

    // ---------- 一覧の 1 行 ----------

    private class Holder(val icon: ImageView, val name: TextView, val sub: TextView, val check: CheckBox, val mark: TextView)

    private inner class RowAdapter : BaseAdapter() {
        private var items: List<AppRow> = emptyList()
        private var now = 0L

        fun show(items: List<AppRow>, now: Long) {
            this.items = items
            this.now = now
            notifyDataSetChanged()
        }

        override fun getCount() = items.size
        override fun getItem(position: Int) = items[position]
        override fun getItemId(position: Int) = items[position].pkg.hashCode().toLong()

        override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
            val view = convertView ?: newRow()
            val h = view.tag as Holder
            val row = items[position]
            val kept = row.pkg in keep
            h.icon.setImageDrawable(icons[row.pkg])
            h.name.text = row.label
            h.sub.text = "${usageLabel(row, now, hasUsage)} ・ ${sizeLabel(row.bytes)}"
            h.check.isChecked = kept
            h.mark.text = if (kept) "残す" else "削除"
            h.mark.setTextColor(if (kept) ACCENT else DANGER)
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
            val sub = TextView(c).apply {
                textSize = 13f
                setTextColor(SUB)
                maxLines = 1
                ellipsize = TextUtils.TruncateAt.END
            }
            // 行全体のタップを一覧側で受けるため、チェックボックス自体は押せなくする
            val check = CheckBox(c).apply {
                isClickable = false
                isFocusable = false
            }
            val mark = TextView(c).apply {
                textSize = 12f
                setTypeface(Typeface.DEFAULT, Typeface.BOLD)
            }
            val texts = LinearLayout(c).apply {
                orientation = LinearLayout.VERTICAL
                addView(name)
                addView(sub)
            }
            return LinearLayout(c).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(20), dp(10), dp(14), dp(10))
                addView(icon, LinearLayout.LayoutParams(dp(42), dp(42)))
                addView(texts, LinearLayout.LayoutParams(0, -2, 1f).apply { leftMargin = dp(14); rightMargin = dp(8) })
                addView(mark)
                addView(check)
                tag = Holder(icon, name, sub, check, mark)
            }
        }
    }
}
