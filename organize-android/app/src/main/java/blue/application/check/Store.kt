package blue.application.check

import android.content.Context

/**
 * 端末の中にだけ残す覚え書き（外には送らない）。
 * - confirmed：本人が「確認済み」にしたアプリ
 * - seen：前回までの点検で見たアプリ。ここにないアプリが「増えた」アプリ
 * - groups：本人が種類を変えたアプリ（パッケージ名 → 種類）
 */
class Store(c: Context) {
    private val prefs = c.getSharedPreferences("check", Context.MODE_PRIVATE)

    var confirmed: Set<String>
        get() = prefs.getStringSet("confirmed", emptySet())!!.toSet()
        set(v) = prefs.edit().putStringSet("confirmed", v).apply()

    /** 初めての点検では null */
    var seen: Set<String>?
        get() = prefs.getStringSet("seen", null)?.toSet()
        set(v) = prefs.edit().putStringSet("seen", v).apply()

    var groups: Map<String, Group>
        get() = prefs.getStringSet("groups", emptySet())!!.mapNotNull { line ->
            val (pkg, name) = line.split("=", limit = 2).takeIf { it.size == 2 } ?: return@mapNotNull null
            Group.entries.firstOrNull { it.name == name }?.let { pkg to it }
        }.toMap()
        set(v) = prefs.edit().putStringSet("groups", v.map { "${it.key}=${it.value.name}" }.toSet()).apply()
}
