package io.github.nobusatokomatsu.screenmemo

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.CalendarContract
import android.widget.Toast
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * 見つけた日付を、選んだカレンダー (Google / Outlook = Microsoft 365) の予定作成画面に渡す。
 * 予定の保存はカレンダーアプリ側で行う。
 */
object CalendarLink {

    enum class App(val label: String, val pkg: String?) {
        AUTO("自動（入っているアプリ）", null),
        GOOGLE("Googleカレンダー", "com.google.android.calendar"),
        OUTLOOK("Outlook（Microsoft 365）", "com.microsoft.office.outlook"),
    }

    private const val PREFS = "settings"
    private const val KEY = "calendar"

    fun app(ctx: Context): App =
        runCatching { App.valueOf(prefs(ctx).getString(KEY, null) ?: "AUTO") }.getOrDefault(App.AUTO)

    fun setApp(ctx: Context, app: App) = prefs(ctx).edit().putString(KEY, app.name).apply()

    /** ボタンなどに出す、追加先の名前 */
    fun targetName(ctx: Context): String = when (resolve(ctx)) {
        App.GOOGLE -> "Googleカレンダー"
        App.OUTLOOK -> "Outlook"
        App.AUTO -> "カレンダー"
    }

    fun open(ctx: Context, hit: DateFinder.Hit, body: String) {
        val insert = insertIntent(hit, body)
        when (resolve(ctx)) {
            App.GOOGLE -> start(ctx, Intent(insert).setPackage(App.GOOGLE.pkg)) || start(ctx, insert) || notFound(ctx)
            // Outlook アプリがなければ、ブラウザの Outlook (Microsoft 365) で開く
            App.OUTLOOK -> start(ctx, Intent(insert).setPackage(App.OUTLOOK.pkg)) ||
                start(ctx, Intent(Intent.ACTION_VIEW, outlookWebUri(hit, body))) || notFound(ctx)
            App.AUTO -> start(ctx, Intent.createChooser(insert, "予定を追加するカレンダー")) || notFound(ctx)
        }
    }

    /** 「自動」のとき、入っているのが片方だけならそちらを使う */
    private fun resolve(ctx: Context): App {
        val chosen = app(ctx)
        if (chosen != App.AUTO) return chosen
        val google = installed(ctx, App.GOOGLE.pkg!!)
        val outlook = installed(ctx, App.OUTLOOK.pkg!!)
        return when {
            google && !outlook -> App.GOOGLE
            outlook && !google -> App.OUTLOOK
            else -> App.AUTO
        }
    }

    private fun insertIntent(hit: DateFinder.Hit, body: String): Intent {
        val (start, end) = range(hit)
        return Intent(Intent.ACTION_INSERT)
            .setData(CalendarContract.Events.CONTENT_URI)
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start.toInstant().toEpochMilli())
            .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end.toInstant().toEpochMilli())
            .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, hit.time == null)
            .putExtra(CalendarContract.Events.TITLE, hit.title)
            .putExtra(CalendarContract.Events.DESCRIPTION, body)
    }

    private fun outlookWebUri(hit: DateFinder.Hit, body: String): Uri {
        val (start, end) = range(hit)
        val fmt = if (hit.time == null) DateTimeFormatter.ISO_LOCAL_DATE else DateTimeFormatter.ISO_OFFSET_DATE_TIME
        return Uri.parse("https://outlook.office.com/calendar/0/deeplink/compose").buildUpon()
            .appendQueryParameter("path", "/calendar/action/compose")
            .appendQueryParameter("rru", "addevent")
            .appendQueryParameter("subject", hit.title)
            .appendQueryParameter("body", body)
            .appendQueryParameter("startdt", start.format(fmt))
            .appendQueryParameter("enddt", end.format(fmt))
            .appendQueryParameter("allday", (hit.time == null).toString())
            .build()
    }

    private fun range(hit: DateFinder.Hit) =
        (if (hit.time == null) hit.date.atStartOfDay() else hit.date.atTime(hit.time)).atZone(ZoneId.systemDefault()).let {
            it to if (hit.time == null) it.plusDays(1) else it.plusHours(1)
        }

    private fun start(ctx: Context, i: Intent): Boolean = try {
        ctx.startActivity(i)
        true
    } catch (e: ActivityNotFoundException) {
        false
    }

    private fun notFound(ctx: Context): Boolean {
        Toast.makeText(ctx, "カレンダーアプリが見つかりません", Toast.LENGTH_LONG).show()
        return false
    }

    private fun installed(ctx: Context, pkg: String) = try {
        ctx.packageManager.getPackageInfo(pkg, 0)
        true
    } catch (e: PackageManager.NameNotFoundException) {
        false
    }

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
