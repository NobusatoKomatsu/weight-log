package io.github.nobusatokomatsu.appsweep

import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.roundToInt

const val INK = 0xFF16201D.toInt()
const val SUB = 0xFF5F6B67.toInt()
const val ACCENT = 0xFF0F766E.toInt()
const val DANGER = 0xFFDC2626.toInt()
const val CARD = 0xFFFFFFFF.toInt()
const val LINE = 0xFFD5DDD9.toInt()
const val OFF = 0xFFB6BFBB.toInt()

fun Context.dp(v: Number): Int = (v.toFloat() * resources.displayMetrics.density).roundToInt()

fun roundRect(color: Int, radius: Float, strokeWidth: Int = 0, strokeColor: Int = 0) =
    GradientDrawable().apply {
        cornerRadius = radius
        setColor(color)
        if (strokeWidth > 0) setStroke(strokeWidth, strokeColor)
    }

/** 角の丸い小さなボタン。on のときは塗りつぶし */
fun Context.chip(label: String, onClick: () -> Unit) = TextView(this).apply {
    text = label
    textSize = 14f
    setPadding(dp(14), dp(8), dp(14), dp(8))
    isClickable = true
    setOnClickListener { onClick() }
    setChipOn(false)
}

fun TextView.setChipOn(on: Boolean) {
    setTextColor(if (on) CARD else INK)
    background = if (on) roundRect(ACCENT, context.dp(18).toFloat())
    else roundRect(CARD, context.dp(18).toFloat(), context.dp(1), LINE)
}

/** edge-to-edge 表示で、システムバーの分だけ内側に余白をとる */
fun View.padForSystemBars() {
    ViewCompat.setOnApplyWindowInsetsListener(this) { v, insets ->
        val b = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
        v.setPadding(b.left, b.top, b.right, b.bottom)
        insets
    }
}
