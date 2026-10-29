package io.github.nobusatokomatsu.screenmemo

import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.provider.Settings
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.WindowManager
import android.widget.TextView
import kotlin.math.hypot

/**
 * 「画面の上」を選んだメモを、他のアプリの上に浮かべて表示する。
 * メモは指でドラッグして動かせ、タップすると編集画面が開く。
 */
class OverlayService : Service() {

    private lateinit var wm: WindowManager
    private val views = mutableListOf<View>()

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        wm = getSystemService(WindowManager::class.java)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startAsForeground()
        clear()
        val memos = MemoStore.load(this).filter { it.showsOverlay }
        if (memos.isEmpty() || !Settings.canDrawOverlays(this)) {
            stopSelf()
            return START_NOT_STICKY
        }
        memos.asReversed().forEach { show(it) }
        return START_STICKY
    }

    override fun onDestroy() {
        clear()
        super.onDestroy()
    }

    private fun startAsForeground() {
        Display.ensureChannels(this)
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val n = Notification.Builder(this, Display.CH_SERVICE)
            .setSmallIcon(R.drawable.ic_note)
            .setContentTitle("画面メモを表示中")
            .setContentText("タップしてメモを編集")
            .setContentIntent(open)
            .setShowWhen(false)
            .build()
        if (Build.VERSION.SDK_INT >= 34) {
            startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(1, n)
        }
    }

    private fun clear() {
        views.forEach { runCatching { wm.removeView(it) } }
        views.clear()
    }

    private fun show(m: Memo) {
        val tv = TextView(this).apply {
            applyMemo(m)
            maxWidth = (resources.displayMetrics.widthPixels * 0.92f).toInt()
        }
        var flags = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
        if (m.passThrough) flags = flags or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        val margin = dp(10)
        val baseX = if (m.col == 1) 0 else margin
        val baseY = if (m.row == 1) 0 else margin
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            flags,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = m.gravity
            x = baseX + m.dx
            y = baseY + m.dy
        }
        if (!m.passThrough) {
            // 右寄せ・下寄せのときは座標の向きが逆になる
            val hx = if (m.col == 2) -1 else 1
            val hy = if (m.row == 2) -1 else 1
            val slop = ViewConfiguration.get(this).scaledTouchSlop
            var sx = 0f
            var sy = 0f
            var ox = 0
            var oy = 0
            var moved = false
            tv.setOnTouchListener { v, e ->
                when (e.actionMasked) {
                    MotionEvent.ACTION_DOWN -> {
                        sx = e.rawX; sy = e.rawY; ox = lp.x; oy = lp.y; moved = false
                    }
                    MotionEvent.ACTION_MOVE -> {
                        val ddx = e.rawX - sx
                        val ddy = e.rawY - sy
                        if (!moved && hypot(ddx, ddy) > slop) moved = true
                        if (moved) {
                            lp.x = ox + (ddx * hx).toInt()
                            lp.y = oy + (ddy * hy).toInt()
                            runCatching { wm.updateViewLayout(v, lp) }
                        }
                    }
                    MotionEvent.ACTION_UP -> {
                        if (moved) {
                            MemoStore.update(this, m.id) { it.dx = lp.x - baseX; it.dy = lp.y - baseY }
                        } else {
                            startActivity(EditActivity.intent(this, m.id).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                        }
                    }
                }
                true
            }
        }
        runCatching {
            wm.addView(tv, lp)
            views.add(tv)
        }
    }
}
