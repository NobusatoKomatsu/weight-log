package io.github.nobusatokomatsu.screenmemo

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.AbsoluteSizeSpan
import android.text.style.ForegroundColorSpan
import android.text.style.StyleSpan
import android.util.TypedValue
import android.widget.RemoteViews

/** ホーム画面ウィジェット。「ホーム画面」を選んだメモを、その文字の大きさ・色で並べて表示する */
class MemoWidget : AppWidgetProvider() {

    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
        mgr.updateAppWidget(ids, views(ctx))
    }

    companion object {
        private fun ids(ctx: Context): IntArray =
            AppWidgetManager.getInstance(ctx).getAppWidgetIds(ComponentName(ctx, MemoWidget::class.java))

        fun hasAny(ctx: Context) = ids(ctx).isNotEmpty()

        fun updateAll(ctx: Context) {
            val ids = ids(ctx)
            if (ids.isNotEmpty()) AppWidgetManager.getInstance(ctx).updateAppWidget(ids, views(ctx))
        }

        /** ホーム画面にウィジェットを追加するよう依頼する。ランチャーが対応していなければ false */
        fun requestPin(ctx: Context): Boolean {
            val mgr = AppWidgetManager.getInstance(ctx)
            if (!mgr.isRequestPinAppWidgetSupported) return false
            return mgr.requestPinAppWidget(ComponentName(ctx, MemoWidget::class.java), null, null)
        }

        private fun views(ctx: Context): RemoteViews {
            val rv = RemoteViews(ctx.packageName, R.layout.widget)
            val open = PendingIntent.getActivity(
                ctx, 0, Intent(ctx, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            rv.setOnClickPendingIntent(R.id.root, open)

            val memos = MemoStore.load(ctx).filter { it.showsWidget }
            if (memos.isEmpty()) {
                rv.setTextViewText(R.id.text, "画面メモで「ホーム画面」にチェックを入れたメモが、ここに表示されます")
                rv.setTextColor(R.id.text, Color.WHITE)
                rv.setTextViewTextSize(R.id.text, TypedValue.COMPLEX_UNIT_SP, 14f)
                rv.setInt(R.id.bg, "setColorFilter", Color.BLACK)
                rv.setInt(R.id.bg, "setImageAlpha", 0x99)
                return rv
            }

            val sb = SpannableStringBuilder()
            memos.forEachIndexed { i, m ->
                if (i > 0) sb.append("\n\n")
                val s = sb.length
                sb.append(m.text.trim())
                val e = sb.length
                sb.setSpan(AbsoluteSizeSpan(m.size, true), s, e, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                sb.setSpan(ForegroundColorSpan(m.color), s, e, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
                if (m.bold) sb.setSpan(StyleSpan(Typeface.BOLD), s, e, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
            val first = memos.first()
            rv.setTextViewText(R.id.text, sb)
            rv.setTextColor(R.id.text, first.color)
            rv.setTextViewTextSize(R.id.text, TypedValue.COMPLEX_UNIT_SP, 12f)
            rv.setInt(R.id.bg, "setColorFilter", first.bg or 0xFF000000.toInt())
            rv.setInt(R.id.bg, "setImageAlpha", Color.alpha(first.bg))
            return rv
        }
    }
}
