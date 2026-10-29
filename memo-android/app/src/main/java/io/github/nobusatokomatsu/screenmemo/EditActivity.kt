package io.github.nobusatokomatsu.screenmemo

import android.Manifest
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.speech.RecognizerIntent
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.CheckBox
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.SeekBar
import android.widget.TextView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.widget.doAfterTextChanged
import kotlin.math.max
import kotlin.math.min

/** メモの編集。文字・大きさ・色・表示先・画面の位置を選び、音声入力もできる */
class EditActivity : ComponentActivity() {

    companion object {
        private const val EXTRA_ID = "id"
        fun intent(ctx: Context, id: Long): Intent =
            Intent(ctx, EditActivity::class.java).putExtra(EXTRA_ID, id)

        private val TEXT_COLORS = listOf(
            "白" to Color.WHITE, "黒" to Color.BLACK, "黄" to 0xFFFFEB3B.toInt(), "赤" to 0xFFF44336.toInt(),
            "青" to 0xFF2196F3.toInt(), "緑" to 0xFF4CAF50.toInt(), "桃" to 0xFFFF4081.toInt(), "橙" to 0xFFFF9800.toInt(),
        )
        private val BG_COLORS = listOf(
            "半透明の黒" to 0xB3000000.toInt(), "黒" to 0xFF000000.toInt(), "なし" to 0x00000000,
            "白" to 0xFFFFFFFF.toInt(), "半透明の白" to 0xCCFFFFFF.toInt(), "付箋の黄" to 0xFFFFF59D.toInt(),
            "ピンク" to 0xFFF8BBD0.toInt(), "水色" to 0xFFB3E5FC.toInt(), "黄緑" to 0xFFC8E6C9.toInt(),
        )
        private val INK = Color.parseColor("#1F2937")
        private val MUTED = Color.parseColor("#6B7280")
        private val ACCENT = Color.parseColor("#F59E0B")
    }

    private lateinit var memo: Memo
    private var isNew = true
    private lateinit var original: String
    private var originalPos = 1

    private lateinit var input: EditText
    private lateinit var preview: TextView
    private lateinit var sizeLabel: TextView
    private lateinit var positionSection: View
    private lateinit var phone: FrameLayout
    private lateinit var mini: TextView
    private val posCells = mutableListOf<TextView>()
    private val textChips = mutableListOf<Pair<Int, View>>()
    private val bgChips = mutableListOf<Pair<Int, View>>()

    // 保存後に、必要な許可を順番にお願いする
    private var askedOverlay = false
    private var askedNotify = false
    private var askedWidget = false

    private val speech = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val said = r.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
        if (r.resultCode == RESULT_OK && !said.isNullOrBlank()) insertText(said)
    }
    private val overlaySettings = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { proceed() }
    private val notifPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { proceed() }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
        )

        val stored = MemoStore.get(this, intent.getLongExtra(EXTRA_ID, -1L))
        isNew = stored == null
        memo = stored?.copy() ?: Memo()
        original = memo.toJson().toString()
        originalPos = memo.pos

        setContentView(buildUi())
        refreshAll()
        if (isNew) {
            input.requestFocus()
            window.setSoftInputMode(
                WindowManager.LayoutParams.SOFT_INPUT_STATE_VISIBLE or WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE
            )
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (!isDirty()) {
                    finish()
                    return
                }
                AlertDialog.Builder(this@EditActivity)
                    .setMessage("変更を保存しますか？")
                    .setPositiveButton("保存") { _, _ -> save() }
                    .setNegativeButton("保存しない") { _, _ -> finish() }
                    .setNeutralButton("キャンセル", null)
                    .show()
            }
        })
    }

    // ---------- 画面づくり ----------

    private fun buildUi(): View {
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(8), dp(4), dp(8), dp(4))
            addView(textButton("← 戻る", INK) { onBackPressedDispatcher.onBackPressed() })
            addView(TextView(this@EditActivity).apply {
                text = if (isNew) "新しいメモ" else "メモを編集"
                textSize = 18f
                setTextColor(INK)
                setTypeface(typeface, Typeface.BOLD)
                gravity = Gravity.CENTER
            }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            if (isNew) {
                addView(View(this@EditActivity), LinearLayout.LayoutParams(dp(72), 1))
            } else {
                addView(textButton("削除", Color.parseColor("#DC2626")) { confirmDelete() })
            }
        }

        input = EditText(this).apply {
            setText(memo.text)
            hint = "ここにメモを入力"
            textSize = 18f
            minLines = 3
            gravity = Gravity.TOP or Gravity.START
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            background = roundRect(Color.WHITE, dp(14).toFloat(), dp(1), Color.parseColor("#E5E7EB"))
            setPadding(dp(14), dp(12), dp(14), dp(12))
            doAfterTextChanged { memo.text = it?.toString().orEmpty(); refreshPreview() }
        }
        val mic = pillButton("🎤 音声で入力", Color.parseColor("#1F2937"), Color.WHITE) { startVoice() }

        preview = TextView(this)
        val previewBox = FrameLayout(this).apply {
            background = GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(Color.parseColor("#64748B"), Color.parseColor("#1E293B")),
            ).apply { cornerRadius = dp(14).toFloat() }
            setPadding(dp(16), dp(20), dp(16), dp(20))
            addView(preview, FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER,
            ))
        }

        sizeLabel = TextView(this).apply { textSize = 15f; setTextColor(INK) }
        val seek = SeekBar(this).apply {
            min = 10
            max = 80
            progress = memo.size
            setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
                override fun onProgressChanged(s: SeekBar, p: Int, fromUser: Boolean) {
                    memo.size = p
                    refreshPreview()
                }
                override fun onStartTrackingTouch(s: SeekBar) {}
                override fun onStopTrackingTouch(s: SeekBar) {}
            })
        }
        val sizeRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            addView(smallButton("小") { seek.progress = max(seek.min, seek.progress - 2) })
            addView(seek, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            addView(smallButton("大") { seek.progress = min(seek.max, seek.progress + 2) })
        }
        val bold = check("太字にする", memo.bold) { memo.bold = it; refreshPreview() }

        val overlay = check("画面の上（どのアプリを使っていても表示）", memo.overlay) {
            memo.overlay = it
            refreshAll()
        }
        val widget = check("ホーム画面（ウィジェット）", memo.widget) { memo.widget = it }
        val notify = check("ロック画面・通知欄", memo.notify) { memo.notify = it }
        val targetNote = note("ロック画面・通知欄では、文字の大きさと色は端末の通知のデザインになります。")

        positionSection = section("画面の位置",
            note("タップして場所を選んでください。表示中のメモは指でドラッグして細かく動かせます。"),
            phoneMock(),
            check("タッチを下のアプリに通す（メモの下を操作できます。ドラッグで動かせなくなります）", memo.passThrough) {
                memo.passThrough = it
            },
        )

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), 0, dp(16), dp(16))
            addView(section("メモ", input, spaced(mic, 8)))
            addView(section("プレビュー", previewBox))
            addView(section("文字の大きさ", sizeLabel, sizeRow, bold))
            addView(section("文字の色", chipRow(TEXT_COLORS, textChips) { memo.color = it; refreshAll() }))
            addView(section("背景", chipRow(BG_COLORS, bgChips) { memo.bg = it; refreshAll() }))
            addView(section("表示する場所（いくつでも選べます）", overlay, widget, notify, targetNote))
            addView(positionSection)
        }

        val saveBtn = pillButton("保存", ACCENT, Color.WHITE) { save() }

        return LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            padForSystemBars()
            addView(header)
            addView(ScrollView(this@EditActivity).apply { addView(content) },
                LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
            addView(saveBtn, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
                setMargins(dp(16), dp(8), dp(16), dp(12))
            })
        }
    }

    /** スマホの形の枠。9 つのマスをタップして位置を選ぶ */
    private fun phoneMock(): View {
        val cells = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        for (r in 0 until 3) {
            val line = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            for (c in 0 until 3) {
                val p = r * 3 + c
                val cell = TextView(this).apply {
                    text = Memo.POS_LABELS[p]
                    textSize = 11f
                    gravity = Gravity.CENTER
                    setOnClickListener {
                        memo.pos = p
                        memo.dx = 0
                        memo.dy = 0
                        refreshAll()
                    }
                }
                posCells.add(cell)
                line.addView(cell, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, 1f).apply {
                    setMargins(dp(2), dp(2), dp(2), dp(2))
                })
            }
            cells.addView(line, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        }
        mini = TextView(this).apply {
            maxLines = 2
            ellipsize = android.text.TextUtils.TruncateAt.END
        }
        phone = FrameLayout(this).apply {
            background = roundRect(Color.parseColor("#334155"), dp(22).toFloat(), dp(5), Color.parseColor("#111827"))
            setPadding(dp(9), dp(14), dp(9), dp(14))
            addView(cells, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            addView(mini, FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        return FrameLayout(this).apply {
            addView(phone, FrameLayout.LayoutParams(dp(180), dp(320), Gravity.CENTER_HORIZONTAL))
        }
    }

    private fun section(title: String, vararg children: View): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(0, dp(18), 0, 0)
        addView(TextView(this@EditActivity).apply {
            text = title
            textSize = 14f
            setTextColor(MUTED)
            setTypeface(typeface, Typeface.BOLD)
            setPadding(dp(2), 0, 0, dp(8))
        })
        children.forEach { addView(it) }
    }

    private fun spaced(v: View, topDp: Int): View {
        v.layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(topDp)
        }
        return v
    }

    private fun note(s: String) = TextView(this).apply {
        text = s
        textSize = 12f
        setTextColor(MUTED)
        setPadding(dp(2), dp(4), dp(2), dp(8))
    }

    private fun check(label: String, value: Boolean, onChange: (Boolean) -> Unit) = CheckBox(this).apply {
        text = label
        textSize = 15f
        setTextColor(INK)
        isChecked = value
        setPadding(dp(6), dp(8), 0, dp(8))
        setOnCheckedChangeListener { _, on -> onChange(on) }
    }

    private fun textButton(label: String, color: Int, onClick: () -> Unit) = TextView(this).apply {
        text = label
        textSize = 16f
        setTextColor(color)
        setPadding(dp(12), dp(12), dp(12), dp(12))
        setOnClickListener { onClick() }
    }

    private fun smallButton(label: String, onClick: () -> Unit) = TextView(this).apply {
        text = label
        textSize = 15f
        gravity = Gravity.CENTER
        setTextColor(INK)
        background = roundRect(Color.WHITE, dp(18).toFloat(), dp(1), Color.parseColor("#E5E7EB"))
        layoutParams = LinearLayout.LayoutParams(dp(40), dp(36))
        setOnClickListener { onClick() }
    }

    private fun chipRow(
        colors: List<Pair<String, Int>>,
        out: MutableList<Pair<Int, View>>,
        onPick: (Int) -> Unit,
    ): View {
        val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        colors.forEach { (name, color) ->
            val chip = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setPadding(dp(4), dp(4), dp(4), dp(4))
                contentDescription = name
                addView(View(this@EditActivity), LinearLayout.LayoutParams(dp(40), dp(40)))
                addView(TextView(this@EditActivity).apply {
                    text = name
                    textSize = 10f
                    setTextColor(MUTED)
                    gravity = Gravity.CENTER
                    maxLines = 1
                })
                setOnClickListener { onPick(color) }
            }
            out.add(color to chip)
            row.addView(chip, LinearLayout.LayoutParams(dp(64), ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        return HorizontalScrollView(this).apply {
            isHorizontalScrollBarEnabled = false
            addView(row)
        }
    }

    // ---------- 表示の更新 ----------

    private fun refreshAll() {
        refreshPreview()
        paintChips(textChips, memo.color)
        paintChips(bgChips, memo.bg)
        positionSection.visibility = if (memo.overlay) View.VISIBLE else View.GONE
        posCells.forEachIndexed { i, cell ->
            val selected = i == memo.pos
            cell.background = roundRect(
                if (selected) 0x55F59E0B else 0x14FFFFFF, dp(8).toFloat(),
                if (selected) dp(2) else 0, ACCENT,
            )
            cell.setTextColor(if (selected) Color.WHITE else 0x99FFFFFF.toInt())
        }
    }

    private fun refreshPreview() {
        preview.applyMemo(memo)
        sizeLabel.text = "文字の大きさ：${memo.size}"
        mini.applyMemo(memo, memo.size * 0.35f + 3f)
        val margin = dp(4)
        mini.layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, memo.gravity,
        ).apply { setMargins(margin, margin, margin, margin) }
    }

    private fun paintChips(chips: List<Pair<Int, View>>, current: Int) {
        chips.forEach { (color, chip) ->
            val swatch = (chip as LinearLayout).getChildAt(0)
            val selected = color == current
            swatch.background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(if (Color.alpha(color) == 0) Color.WHITE else color)
                setStroke(
                    if (selected) dp(4) else dp(1),
                    if (selected) ACCENT else Color.parseColor("#D1D5DB"),
                    if (Color.alpha(color) == 0 && !selected) dp(3).toFloat() else 0f,
                    if (Color.alpha(color) == 0 && !selected) dp(3).toFloat() else 0f,
                )
            }
        }
    }

    // ---------- 音声入力 ----------

    private fun startVoice() {
        val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ja-JP")
            .putExtra(RecognizerIntent.EXTRA_PROMPT, "メモにしたいことを話してください")
        try {
            speech.launch(i)
        } catch (e: ActivityNotFoundException) {
            Toast.makeText(this, "この端末では音声入力が使えません（Google アプリを確認してください）", Toast.LENGTH_LONG).show()
        }
    }

    /** カーソルの位置に (選択中ならその部分を置き換えて) 話した言葉を入れる */
    private fun insertText(s: String) {
        val text = input.text
        val a = max(0, min(input.selectionStart, input.selectionEnd))
        val b = max(0, max(input.selectionStart, input.selectionEnd))
        val start = if (input.hasFocus()) a else text.length
        val end = if (input.hasFocus()) b else text.length
        text.replace(start, end, s)
        input.setSelection(start + s.length)
    }

    // ---------- 保存・削除 ----------

    private fun isDirty() = memo.toJson().toString() != original

    private fun save() {
        if (memo.text.isBlank()) {
            Toast.makeText(this, "メモを入力してください", Toast.LENGTH_SHORT).show()
            return
        }
        // 画面の位置を変えていなければ、表示中にドラッグして動かした場所を残す
        val stored = MemoStore.get(this, memo.id)
        if (stored != null && memo.pos == originalPos) {
            memo.dx = stored.dx
            memo.dy = stored.dy
        }
        MemoStore.put(this, memo)
        original = memo.toJson().toString()
        Display.refresh(this)
        proceed()
    }

    private fun proceed() {
        when {
            memo.showsOverlay && !Settings.canDrawOverlays(this) && !askedOverlay -> {
                askedOverlay = true
                AlertDialog.Builder(this)
                    .setTitle("許可をお願いします")
                    .setMessage("メモを他のアプリの上に表示するため、次の画面で「画面メモ」の「他のアプリの上に重ねて表示」をオンにしてください。")
                    .setPositiveButton("設定を開く") { _, _ ->
                        overlaySettings.launch(
                            Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
                        )
                    }
                    .setNegativeButton("あとで") { _, _ -> proceed() }
                    .setCancelable(false)
                    .show()
            }
            memo.showsNotify && !Display.canNotify(this) && !askedNotify && Build.VERSION.SDK_INT >= 33 -> {
                askedNotify = true
                notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
            memo.showsWidget && !MemoWidget.hasAny(this) && !askedWidget -> {
                askedWidget = true
                if (!MemoWidget.requestPin(this)) {
                    Toast.makeText(this, "ホーム画面を長押し →「ウィジェット」→「画面メモ」を追加してください", Toast.LENGTH_LONG).show()
                }
                proceed()
            }
            else -> {
                Display.refresh(this)
                Toast.makeText(this, "保存しました", Toast.LENGTH_SHORT).show()
                finish()
            }
        }
    }

    private fun confirmDelete() {
        AlertDialog.Builder(this)
            .setMessage("このメモを削除しますか？")
            .setPositiveButton("削除") { _, _ ->
                MemoStore.delete(this, memo.id)
                Display.refresh(this)
                finish()
            }
            .setNegativeButton("キャンセル", null)
            .show()
    }
}
