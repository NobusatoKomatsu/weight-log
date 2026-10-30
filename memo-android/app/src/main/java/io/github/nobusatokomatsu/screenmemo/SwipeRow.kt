package io.github.nobusatokomatsu.screenmemo

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.view.Gravity
import android.view.MotionEvent
import android.view.VelocityTracker
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.TextView
import androidx.core.animation.doOnEnd
import kotlin.math.abs
import kotlin.math.sign

/**
 * 一覧の 1 行。左右にスワイプすると、Gmail のように行が流れて消え onDismiss が呼ばれる。
 * 下には「削除」の赤い背景が見える。タップや表示スイッチは中の card がそのまま受け取る。
 */
@SuppressLint("ViewConstructor")
class SwipeRow(ctx: Context, private val card: View, private val onDismiss: () -> Unit) : FrameLayout(ctx) {

    private val slop = ViewConfiguration.get(ctx).scaledTouchSlop
    private val minFling = ViewConfiguration.get(ctx).scaledMinimumFlingVelocity * 6f
    private val back = FrameLayout(ctx)
    private val leftLabel = label(ctx, Gravity.START)
    private val rightLabel = label(ctx, Gravity.END)
    private var downX = 0f
    private var downY = 0f
    private var dragging = false
    private var done = false
    private var velocity: VelocityTracker? = null

    init {
        back.background = roundRect(Color.parseColor("#DC2626"), ctx.dp(16).toFloat())
        back.visibility = View.INVISIBLE
        back.addView(leftLabel, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        back.addView(rightLabel, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(back, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
        addView(card, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))
    }

    private fun label(ctx: Context, side: Int) = TextView(ctx).apply {
        text = "🗑 削除"
        textSize = 15f
        setTextColor(Color.WHITE)
        setTypeface(typeface, Typeface.BOLD)
        gravity = side or Gravity.CENTER_VERTICAL
        setPadding(ctx.dp(24), 0, ctx.dp(24), 0)
        visibility = View.INVISIBLE
    }

    override fun onInterceptTouchEvent(e: MotionEvent): Boolean {
        if (done) return true
        when (e.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = e.rawX
                downY = e.rawY
                dragging = false
                velocity?.recycle()
                velocity = VelocityTracker.obtain()
                velocity?.addMovement(e)
            }
            MotionEvent.ACTION_MOVE -> {
                velocity?.addMovement(e)
                if (isSideways(e)) {
                    startDrag()
                    return true
                }
            }
        }
        return false
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e: MotionEvent): Boolean {
        if (done) return true
        velocity?.addMovement(e)
        when (e.actionMasked) {
            MotionEvent.ACTION_MOVE -> {
                if (!dragging && isSideways(e)) startDrag()
                if (dragging) moveTo(e.rawX - downX)
            }
            MotionEvent.ACTION_UP -> if (dragging) release(e.rawX - downX)
            MotionEvent.ACTION_CANCEL -> if (dragging) settle()
        }
        return true
    }

    private fun isSideways(e: MotionEvent): Boolean {
        val dx = abs(e.rawX - downX)
        return dx > slop && dx > abs(e.rawY - downY) * 1.5f
    }

    private fun startDrag() {
        dragging = true
        parent?.requestDisallowInterceptTouchEvent(true)
        back.visibility = View.VISIBLE
    }

    private fun moveTo(x: Float) {
        card.translationX = x
        leftLabel.visibility = if (x > 0) View.VISIBLE else View.INVISIBLE
        rightLabel.visibility = if (x < 0) View.VISIBLE else View.INVISIBLE
    }

    /** 指を離したとき：十分に動かしたか、勢いよく払ったら削除、そうでなければ元の位置へ */
    private fun release(x: Float) {
        dragging = false
        val v = velocity?.let { it.computeCurrentVelocity(1000); it.xVelocity } ?: 0f
        velocity?.recycle()
        velocity = null
        val w = width.toFloat()
        val flung = abs(v) > minFling && sign(v) == sign(x) && abs(x) > w * 0.1f
        if (abs(x) > w * 0.4f || flung) dismiss(sign(x)) else settle()
    }

    private fun settle() {
        dragging = false
        card.animate().translationX(0f).setDuration(150).withEndAction {
            back.visibility = View.INVISIBLE
            moveTo(0f)
        }.start()
    }

    /** 行を画面の外へ流してから、高さを縮めて詰める */
    private fun dismiss(direction: Float) {
        done = true
        card.animate().translationX(direction * width).setDuration(160).withEndAction {
            back.visibility = View.INVISIBLE
            val lp = layoutParams as ViewGroup.MarginLayoutParams
            val h = height
            val margin = lp.topMargin
            ValueAnimator.ofFloat(1f, 0f).apply {
                duration = 180
                addUpdateListener {
                    val f = it.animatedValue as Float
                    lp.height = (h * f).toInt()
                    lp.topMargin = (margin * f).toInt()
                    layoutParams = lp
                }
                doOnEnd { onDismiss() }
                start()
            }
        }.start()
    }
}
