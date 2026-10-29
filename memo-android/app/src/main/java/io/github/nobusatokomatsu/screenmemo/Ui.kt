package io.github.nobusatokomatsu.screenmemo

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.View
import android.widget.Button
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt

fun Context.dp(v: Number): Int = (v.toFloat() * resources.displayMetrics.density).roundToInt()

fun roundRect(color: Int, radius: Float, strokeWidth: Int = 0, strokeColor: Int = 0) =
    GradientDrawable().apply {
        cornerRadius = radius
        setColor(color)
        if (strokeWidth > 0) setStroke(strokeWidth, strokeColor)
    }

fun isLight(c: Int) = (Color.red(c) * 299 + Color.green(c) * 587 + Color.blue(c) * 114) / 1000 > 150

/** メモの見た目 (文字の大きさ・色・太さ・背景) を TextView に当てる */
fun TextView.applyMemo(m: Memo, sizeSp: Float = m.size.toFloat()) {
    val c = context
    text = m.text.ifBlank { "（メモ）" }
    setTextSize(TypedValue.COMPLEX_UNIT_SP, sizeSp)
    setTextColor(m.color)
    setTypeface(Typeface.DEFAULT, if (m.bold) Typeface.BOLD else Typeface.NORMAL)
    background = roundRect(m.bg, c.dp(12).toFloat())
    val k = (sizeSp / 24f).coerceIn(0.5f, 1.5f)
    setPadding(c.dp(14 * k), c.dp(9 * k), c.dp(14 * k), c.dp(9 * k))
    // 背景なしのときは縁取りで読みやすく
    if (Color.alpha(m.bg) < 0x40) {
        setShadowLayer(c.dp(3).toFloat(), 0f, 0f, if (isLight(m.color)) Color.BLACK else Color.WHITE)
    } else {
        setShadowLayer(0f, 0f, 0f, 0)
    }
}

fun Context.pillButton(label: String, bg: Int, fg: Int, onClick: () -> Unit) = Button(this).apply {
    text = label
    isAllCaps = false
    textSize = 16f
    setTextColor(fg)
    background = roundRect(bg, dp(24).toFloat())
    stateListAnimator = null
    setPadding(dp(20), dp(12), dp(20), dp(12))
    setOnClickListener { onClick() }
}

/** edge-to-edge 表示で、システムバーとキーボードの分だけ内側に余白をとる */
fun View.padForSystemBars() {
    ViewCompat.setOnApplyWindowInsetsListener(this) { v, insets ->
        val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
        v.setPadding(b.left, b.top, b.right, b.bottom)
        insets
    }
}
