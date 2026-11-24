package blue.application.check

import android.content.Context

/**
 * 端末の中にだけ残す覚え書き（外には送らない）。
 * - confirmed：本人が「確認済み」にしたアプリ
 * - seen：前回までの点検で見たアプリ。ここにないアプリが「増えた」アプリ
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
}
