package io.github.nobusatokomatsu.screenmemo

import android.content.Context
import android.graphics.Color
import android.view.Gravity
import org.json.JSONArray
import org.json.JSONObject

/**
 * 1 件のメモと、その見た目・表示先。
 * pos は画面の位置 (0..8: 左上, 上, 右上, 左, 中央, 右, 左下, 下, 右下)、dx/dy は指でドラッグした分のずれ。
 */
data class Memo(
    val id: Long = System.currentTimeMillis(),
    var text: String = "",
    var size: Int = 24,
    var color: Int = Color.WHITE,
    var bg: Int = 0xB3000000.toInt(),
    var bold: Boolean = false,
    var on: Boolean = true,
    var overlay: Boolean = true,
    var widget: Boolean = false,
    var notify: Boolean = false,
    var pos: Int = 1,
    var dx: Int = 0,
    var dy: Int = 0,
    var passThrough: Boolean = false,
    /** カレンダーに登録した (または登録しないと答えた) 予定の目印 */
    var calKey: String = "",
) {
    val col get() = pos % 3
    val row get() = pos / 3
    val gravity: Int
        get() = intArrayOf(Gravity.LEFT, Gravity.CENTER_HORIZONTAL, Gravity.RIGHT)[col] or
            intArrayOf(Gravity.TOP, Gravity.CENTER_VERTICAL, Gravity.BOTTOM)[row]

    val showsOverlay get() = on && overlay && text.isNotBlank()
    val showsWidget get() = on && widget && text.isNotBlank()
    val showsNotify get() = on && notify && text.isNotBlank()

    fun targetsLabel(): String = listOfNotNull(
        if (overlay) "画面の上（${POS_LABELS[pos]}）" else null,
        if (widget) "ホーム画面" else null,
        if (notify) "ロック画面・通知" else null,
    ).joinToString(" / ").ifEmpty { "表示先なし" }

    fun toJson(): JSONObject = JSONObject()
        .put("id", id).put("text", text).put("size", size)
        .put("color", color).put("bg", bg).put("bold", bold)
        .put("on", on).put("overlay", overlay).put("widget", widget).put("notify", notify)
        .put("pos", pos).put("dx", dx).put("dy", dy).put("passThrough", passThrough)
        .put("calKey", calKey)

    companion object {
        val POS_LABELS = listOf("左上", "上", "右上", "左", "中央", "右", "左下", "下", "右下")

        fun fromJson(o: JSONObject) = Memo(
            id = o.getLong("id"),
            text = o.optString("text"),
            size = o.optInt("size", 24),
            color = o.optInt("color", Color.WHITE),
            bg = o.optInt("bg", 0xB3000000.toInt()),
            bold = o.optBoolean("bold"),
            on = o.optBoolean("on", true),
            overlay = o.optBoolean("overlay", true),
            widget = o.optBoolean("widget"),
            notify = o.optBoolean("notify"),
            pos = o.optInt("pos", 1).coerceIn(0, 8),
            dx = o.optInt("dx"),
            dy = o.optInt("dy"),
            passThrough = o.optBoolean("passThrough"),
            calKey = o.optString("calKey"),
        )
    }
}

/** メモは端末内 (SharedPreferences) にだけ保存する */
object MemoStore {
    private const val PREFS = "memos"
    private const val KEY = "list"

    fun load(ctx: Context): MutableList<Memo> {
        val raw = prefs(ctx).getString(KEY, null) ?: return mutableListOf()
        return runCatching {
            val a = JSONArray(raw)
            MutableList(a.length()) { Memo.fromJson(a.getJSONObject(it)) }
        }.getOrElse { mutableListOf() }
    }

    fun get(ctx: Context, id: Long): Memo? = load(ctx).find { it.id == id }

    fun put(ctx: Context, memo: Memo) {
        val list = load(ctx)
        val i = list.indexOfFirst { it.id == memo.id }
        if (i >= 0) list[i] = memo else list.add(0, memo)
        saveAll(ctx, list)
    }

    fun update(ctx: Context, id: Long, change: (Memo) -> Unit) {
        val list = load(ctx)
        list.find { it.id == id }?.let { change(it); saveAll(ctx, list) }
    }

    /** 削除を取り消したとき、元の位置に戻す */
    fun insert(ctx: Context, memo: Memo, index: Int) {
        val list = load(ctx)
        if (list.any { it.id == memo.id }) return
        list.add(index.coerceIn(0, list.size), memo)
        saveAll(ctx, list)
    }

    fun delete(ctx: Context, id: Long) = saveAll(ctx, load(ctx).filterNot { it.id == id })

    private fun saveAll(ctx: Context, list: List<Memo>) {
        val a = JSONArray()
        list.forEach { a.put(it.toJson()) }
        prefs(ctx).edit().putString(KEY, a.toString()).apply()
    }

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
}
