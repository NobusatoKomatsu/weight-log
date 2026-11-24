package blue.application.check

import android.app.AppOpsManager
import android.app.usage.StorageStatsManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.graphics.drawable.Drawable
import android.os.Build
import android.os.Process
import android.os.storage.StorageManager
import java.io.File

class Loaded(val rows: List<AppRow>, val icons: Map<String, Drawable>, val hasUsage: Boolean)

/** これより前の時刻は「使用記録なし」として扱う（未使用のアプリは 1970 年付近の値が返る） */
private const val MIN_VALID_TIME = 1_262_304_000_000L // 2010-01-01

fun hasUsageAccess(c: Context): Boolean {
    val ops = c.getSystemService(AppOpsManager::class.java)
    @Suppress("DEPRECATION")
    val mode = if (Build.VERSION.SDK_INT >= 29) {
        ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.packageName)
    } else {
        ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.packageName)
    }
    return mode == AppOpsManager.MODE_ALLOWED
}

fun isInstalled(c: Context, pkg: String): Boolean = try {
    c.packageManager.getApplicationInfo(pkg, 0)
    true
} catch (e: PackageManager.NameNotFoundException) {
    false
}

/**
 * あとから入ったアプリ（最初から入っているシステムアプリと、このアプリ自身を除く）を調べる。
 * 時間がかかるので画面とは別のスレッドで呼ぶ
 */
fun loadApps(c: Context): Loaded {
    val pm = c.packageManager
    val now = System.currentTimeMillis()
    val hasUsage = hasUsageAccess(c)

    val used: Map<String, Long> = if (hasUsage) {
        try {
            c.getSystemService(UsageStatsManager::class.java)
                .queryAndAggregateUsageStats(now - 3 * 365 * DAY_MS, now)
                .mapValues { it.value.lastTimeUsed }
        } catch (e: Exception) {
            emptyMap()
        }
    } else emptyMap()

    val storage = c.getSystemService(StorageStatsManager::class.java)
    val rows = ArrayList<AppRow>()
    val icons = HashMap<String, Drawable>()

    for (app in pm.getInstalledApplications(0)) {
        if (app.flags and ApplicationInfo.FLAG_SYSTEM != 0) continue
        if (app.packageName == c.packageName) continue
        val pkg = app.packageName

        val installed = try {
            pm.getPackageInfo(pkg, 0).firstInstallTime
        } catch (e: Exception) {
            now
        }
        // 許可がないときは、アプリ本体のファイルの大きさだけ
        val sizes = (if (hasUsage) storageBytes(storage, pkg) else null) ?: longArrayOf(apkBytes(app), 0, 0)

        rows += AppRow(
            pkg = pkg,
            label = app.loadLabel(pm).toString(),
            lastUsed = used[pkg]?.takeIf { it >= MIN_VALID_TIME } ?: 0,
            installed = installed,
            appBytes = sizes[0],
            dataBytes = sizes[1],
            cacheBytes = sizes[2],
            installer = installerOf(pm, pkg),
            category = app.category,
        )
        try {
            icons[pkg] = app.loadIcon(pm)
        } catch (e: Exception) {
            // アイコンなしで表示する
        }
    }
    return Loaded(rows, icons, hasUsage)
}

/** 詳細画面に出す入手元の名前 */
fun sourceLabel(c: Context, row: AppRow): String {
    val installer = row.installer ?: return "不明（Google Play 以外）"
    if (row.fromPlay) return "Google Play"
    // 入れたアプリが見えないとき（一覧に出ない種類のアプリ）は、パッケージ名をそのまま出す
    val name = try {
        c.packageManager.getApplicationInfo(installer, 0).loadLabel(c.packageManager).toString()
    } catch (e: Exception) {
        installer
    }
    return "$name（Google Play 以外）"
}

/** このアプリを入れたアプリ（Google Play なら com.android.vending）。分からなければ null */
private fun installerOf(pm: PackageManager, pkg: String): String? = try {
    if (Build.VERSION.SDK_INT >= 30) {
        pm.getInstallSourceInfo(pkg).installingPackageName
    } else {
        @Suppress("DEPRECATION")
        pm.getInstallerPackageName(pkg)
    }
} catch (e: Exception) {
    null
}

/** アプリ本体・データ・キャッシュ。「使用状況へのアクセス」が必要 */
private fun storageBytes(storage: StorageStatsManager, pkg: String): LongArray? = try {
    val s = storage.queryStatsForPackage(StorageManager.UUID_DEFAULT, pkg, Process.myUserHandle())
    // dataBytes はキャッシュを含むので、分けて見せるために引く
    longArrayOf(s.appBytes, (s.dataBytes - s.cacheBytes).coerceAtLeast(0), s.cacheBytes)
} catch (e: Exception) {
    null
}

private fun apkBytes(app: ApplicationInfo): Long =
    (listOfNotNull(app.sourceDir) + (app.splitSourceDirs?.toList() ?: emptyList()))
        .sumOf { runCatching { File(it).length() }.getOrDefault(0L) }
