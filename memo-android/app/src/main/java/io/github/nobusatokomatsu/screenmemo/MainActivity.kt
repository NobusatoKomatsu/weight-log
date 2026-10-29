package io.github.nobusatokomatsu.screenmemo

import android.Manifest
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts

/** メモの一覧。各メモの表示のオン・オフと、新しいメモの追加 */
class MainActivity : ComponentActivity() {

    companion object {
        const val ACTION_NEW = "io.github.nobusatokomatsu.screenmemo.NEW"
        const val ACTION_VOICE = "io.github.nobusatokomatsu.screenmemo.VOICE"
        const val PRIVACY_URL = "https://sixpac.jp/memo/privacy.html"
    }

    private lateinit var list: LinearLayout
    private lateinit var banners: LinearLayout

    private val notifPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        if (!ok) openNotificationSettings()
        render()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge(
            SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
        )

        val title = TextView(this).apply {
            text = "画面メモ"
            textSize = 26f
            setTextColor(Color.parseColor("#1F2937"))
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }
        val sub = TextView(this).apply {
            text = "スマホの画面にメモを表示します"
            textSize = 14f
            setTextColor(Color.parseColor("#6B7280"))
        }
        banners = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        list = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(16))
            addView(title)
            addView(sub)
            addView(banners)
            addView(list)
        }
        val add = pillButton("＋ 新しいメモ", Color.parseColor("#F59E0B"), Color.WHITE) {
            startActivity(EditActivity.intent(this, -1L))
        }

        setContentView(LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            padForSystemBars()
            addView(ScrollView(this@MainActivity).apply { addView(content) },
                LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
            addView(add, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                setMargins(dp(16), dp(8), dp(16), dp(16))
            })
        })
        if (savedInstanceState == null) handleShortcut(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleShortcut(intent)
    }

    /** ホーム画面のアイコン長押しメニューから「新しいメモ」「音声でメモ」 */
    private fun handleShortcut(intent: Intent?) {
        when (intent?.action) {
            ACTION_NEW -> startActivity(EditActivity.intent(this, -1L))
            ACTION_VOICE -> startActivity(EditActivity.intent(this, -1L, voice = true))
            else -> return
        }
        intent?.action = null
    }

    override fun onResume() {
        super.onResume()
        Display.refresh(this)
        render()
    }

    private fun render() {
        val memos = MemoStore.load(this)

        banners.removeAllViews()
        if (memos.any { it.showsOverlay } && !Settings.canDrawOverlays(this)) {
            banners.addView(banner("「画面の上」に表示するには、他のアプリの上に重ねて表示する許可が必要です。") {
                startActivity(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName")))
            })
        }
        if (memos.any { it.showsNotify } && !Display.canNotify(this)) {
            banners.addView(banner("「ロック画面・通知」に表示するには、通知の許可が必要です。") {
                if (Build.VERSION.SDK_INT >= 33) notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
                else openNotificationSettings()
            })
        }

        list.removeAllViews()
        if (memos.isEmpty()) {
            list.addView(TextView(this).apply {
                text = "まだメモがありません。\n下の「＋ 新しいメモ」から作りましょう。\n\n・文字の大きさや色を選べます\n・🎤 音声でも入力できます\n・「明日15時 歯医者」のように日付を書くと、Googleカレンダー・Outlook（Microsoft 365）に追加できます\n・画面の上 / ホーム画面 / ロック画面 から表示先を選べます\n・用が済んだら、画面の上のメモは長押し、通知は「済み」で消せます\n・アイコン長押しで「新しいメモ」「音声でメモ」"
                textSize = 15f
                setLineSpacing(0f, 1.4f)
                setTextColor(Color.parseColor("#6B7280"))
                setPadding(dp(4), dp(32), dp(4), dp(16))
            })
        }
        memos.forEach { list.addView(row(it)) }
        list.addView(calendarSetting())
        list.addView(TextView(this).apply {
            text = "プライバシーポリシー"
            textSize = 13f
            setTextColor(Color.parseColor("#6B7280"))
            paintFlags = paintFlags or android.graphics.Paint.UNDERLINE_TEXT_FLAG
            setPadding(dp(4), dp(20), dp(4), dp(8))
            setOnClickListener {
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(PRIVACY_URL))) }
            }
        })
    }

    /** 日付のあるメモを、どのカレンダーに追加するか (Google / Outlook = Microsoft 365) */
    private fun calendarSetting(): View = TextView(this).apply {
        text = "📅 予定を追加するカレンダー：${CalendarLink.app(this@MainActivity).label}  ›"
        textSize = 14f
        setTextColor(Color.parseColor("#374151"))
        background = roundRect(Color.WHITE, dp(14).toFloat())
        setPadding(dp(14), dp(14), dp(14), dp(14))
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(24)
        }
        setOnClickListener {
            val apps = CalendarLink.App.entries
            AlertDialog.Builder(this@MainActivity)
                .setTitle("予定を追加するカレンダー")
                .setSingleChoiceItems(
                    apps.map { it.label }.toTypedArray(),
                    apps.indexOf(CalendarLink.app(this@MainActivity)),
                ) { d, which ->
                    CalendarLink.setApp(this@MainActivity, apps[which])
                    d.dismiss()
                    render()
                }
                .setNegativeButton("キャンセル", null)
                .show()
        }
    }

    private fun row(m: Memo): View {
        val preview = TextView(this).apply {
            applyMemo(m, m.size.coerceAtMost(22).toFloat())
            maxLines = 3
            ellipsize = TextUtils.TruncateAt.END
        }
        val where = TextView(this).apply {
            text = m.targetsLabel()
            textSize = 12f
            setTextColor(Color.parseColor("#6B7280"))
            setPadding(dp(2), dp(6), 0, 0)
        }
        val left = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            addView(preview, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
            addView(where)
        }
        val toggle = Switch(this).apply {
            isChecked = m.on
            contentDescription = "表示する"
            setOnCheckedChangeListener { _, on ->
                MemoStore.update(this@MainActivity, m.id) { it.on = on }
                Display.refresh(this@MainActivity)
                render()
            }
        }
        return LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = roundRect(Color.WHITE, dp(16).toFloat())
            setPadding(dp(12), dp(12), dp(12), dp(12))
            alpha = if (m.on) 1f else 0.55f
            setOnClickListener { startActivity(EditActivity.intent(this@MainActivity, m.id)) }
            addView(left, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
            addView(toggle)
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(12)
            }
        }
    }

    private fun banner(message: String, onClick: () -> Unit): View = LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        background = roundRect(Color.parseColor("#FEF3C7"), dp(14).toFloat(), dp(1), Color.parseColor("#F59E0B"))
        setPadding(dp(14), dp(12), dp(14), dp(12))
        addView(TextView(this@MainActivity).apply {
            text = message
            textSize = 14f
            setTextColor(Color.parseColor("#92400E"))
        })
        addView(pillButton("許可する", Color.parseColor("#F59E0B"), Color.WHITE, onClick),
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                topMargin = dp(8)
            })
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(12)
        }
    }

    private fun openNotificationSettings() {
        startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, packageName))
    }
}
