package io.github.nobusatokomatsu.screenmemo

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings

/** 保存されたメモを、選ばれた表示先 (画面の上・ホーム画面・ロック画面/通知) に反映する */
object Display {
    const val CH_MEMO = "memo"
    const val CH_SERVICE = "overlay"
    private const val TAG = "memo"

    fun refresh(ctx: Context) {
        val memos = MemoStore.load(ctx)
        val svc = Intent(ctx, OverlayService::class.java)
        if (memos.any { it.showsOverlay } && Settings.canDrawOverlays(ctx)) {
            runCatching { ctx.startForegroundService(svc) }
        } else {
            ctx.stopService(svc)
        }
        syncNotifications(ctx, memos)
        MemoWidget.updateAll(ctx)
    }

    fun canNotify(ctx: Context) = Build.VERSION.SDK_INT < 33 ||
        ctx.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun ensureChannels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CH_MEMO, "メモ（ロック画面・通知欄）", NotificationManager.IMPORTANCE_DEFAULT).apply {
                setSound(null, null)
                enableVibration(false)
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CH_SERVICE, "画面の上に表示中", NotificationManager.IMPORTANCE_MIN).apply {
                setShowBadge(false)
            }
        )
    }

    private fun notifId(m: Memo) = (m.id xor (m.id ushr 32)).toInt() and 0x7fffffff

    private fun syncNotifications(ctx: Context, memos: List<Memo>) {
        ensureChannels(ctx)
        val nm = ctx.getSystemService(NotificationManager::class.java)
        val want = memos.filter { it.showsNotify }
        val ids = want.map { notifId(it) }.toSet()
        nm.activeNotifications.filter { it.tag == TAG && it.id !in ids }.forEach { nm.cancel(TAG, it.id) }
        if (!canNotify(ctx)) return
        want.forEach { m ->
            val id = notifId(m)
            val open = PendingIntent.getActivity(
                ctx, id, EditActivity.intent(ctx, m.id),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            val lines = m.text.trim().lines()
            val n = Notification.Builder(ctx, CH_MEMO)
                .setSmallIcon(R.drawable.ic_note)
                .setContentTitle(lines.first())
                .setContentText(lines.drop(1).joinToString(" ").ifBlank { null })
                .setStyle(Notification.BigTextStyle().bigText(m.text.trim()))
                .setContentIntent(open)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true)
                .setShowWhen(false)
                .setOnlyAlertOnce(true)
                .build()
            nm.notify(TAG, id, n)
        }
    }
}
