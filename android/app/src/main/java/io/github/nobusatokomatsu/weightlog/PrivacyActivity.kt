package io.github.nobusatokomatsu.weightlog

import android.graphics.Color
import android.os.Bundle
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity

/** Health Connect の権限画面から表示される、データの扱いについての説明 */
class PrivacyActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (24 * resources.displayMetrics.density).toInt()
        val text = TextView(this).apply {
            setPadding(pad, pad * 2, pad, pad)
            setTextColor(Color.parseColor("#E2E8F0"))
            textSize = 15f
            setLineSpacing(0f, 1.4f)
            text = """
                体脂肪率 のデータの扱いについて

                ・Health Connect から「体重」と「体脂肪率」を読み取ります。
                ・読み取ったデータはこの端末のアプリ内にだけ保存され、外部のサーバーには送信しません。
                ・書き込みは行いません。
                ・連携は Android の設定 → Health Connect からいつでも解除できます。
            """.trimIndent()
        }
        setContentView(ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#0B0F1A"))
            addView(text)
        })
    }
}
