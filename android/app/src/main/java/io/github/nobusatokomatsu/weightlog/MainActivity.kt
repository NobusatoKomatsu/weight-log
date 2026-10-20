package io.github.nobusatokomatsu.weightlog

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Percentage
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToInt
import kotlin.reflect.KClass

/**
 * 公開中の体脂肪率 (GitHub Pages) を WebView で表示し、
 * Health Connect の体重・体脂肪率を読み取って JS 側 (window.onHealthConnect) に渡す。
 * 手入力した体脂肪率は Health Connect に書き込み、Health やウェリーなど他のアプリにも届ける。
 */
class MainActivity : ComponentActivity() {

    companion object {
        const val APP_URL = "https://sixpac.jp/"
        val APP_HOSTS = setOf("sixpac.jp", "nobusatokomatsu.github.io")
        const val HISTORY_PERMISSION = "android.permission.health.READ_HEALTH_DATA_HISTORY"
        const val HC_PACKAGE = "com.google.android.apps.healthdata"
        const val SYNC_DAYS = 3650L
    }

    private lateinit var root: FrameLayout
    private lateinit var web: WebView

    private val readPermissions = setOf(
        HealthPermission.getReadPermission(WeightRecord::class),
        HealthPermission.getReadPermission(BodyFatRecord::class),
    )

    private val fatWritePermission = HealthPermission.getWritePermission(BodyFatRecord::class)

    private var pendingFatJson: String? = null
    private val writePermissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        val json = pendingFatJson
        pendingFatJson = null
        if (fatWritePermission in granted && json != null) writeFat(json, interactive = true)
        else sendWrite(JSONObject().put("status", "write_denied"))
    }

    private val permissionLauncher = registerForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted ->
        if (granted.containsAll(readPermissions)) sync(interactive = true)
        else send(JSONObject().put("status", "denied"))
    }

    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private val fileLauncher = registerForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        fileCallback?.onReceiveValue(uri?.let { arrayOf(it) })
        fileCallback = null
    }

    private var pendingSaveText: String? = null
    private val saveLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("text/csv")) { uri ->
        val text = pendingSaveText
        pendingSaveText = null
        if (uri == null || text == null) return@registerForActivityResult
        try {
            contentResolver.openOutputStream(uri)?.use { it.write(text.toByteArray(Charsets.UTF_8)) }
            Toast.makeText(this, "保存しました", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "保存に失敗しました", Toast.LENGTH_SHORT).show()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        root = FrameLayout(this).apply { setBackgroundColor(Color.parseColor("#0B0F1A")) }
        web = WebView(this)
        root.addView(web, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)

        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.addJavascriptInterface(Bridge(), "HealthBridge")

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host in APP_HOSTS) return false
                openExternal(request.url)
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: FileChooserParams,
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                fileLauncher.launch("*/*")
                return true
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        // 毎回最新のページを読み込む (GitHub Pages の HTML キャッシュを回避)
        if (savedInstanceState == null) web.loadUrl("$APP_URL?t=${System.currentTimeMillis()}") else web.restoreState(savedInstanceState)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    /** Health Connect から読み取り、日付ごと (その日の最初の測定) にまとめて JS に渡す */
    private fun sync(interactive: Boolean) {
        when (HealthConnectClient.getSdkStatus(this, HC_PACKAGE)) {
            HealthConnectClient.SDK_AVAILABLE -> Unit
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> {
                if (interactive) openExternal(Uri.parse("market://details?id=$HC_PACKAGE"))
                send(JSONObject().put("status", "update_required"))
                return
            }
            else -> {
                send(JSONObject().put("status", "unavailable"))
                return
            }
        }

        val client = HealthConnectClient.getOrCreate(this)
        lifecycleScope.launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                if (!granted.containsAll(readPermissions)) {
                    if (interactive) permissionLauncher.launch(readPermissions + HISTORY_PERMISSION)
                    else send(JSONObject().put("status", "need_permission"))
                    return@launch
                }

                val start = Instant.now().minus(Duration.ofDays(SYNC_DAYS))
                val weights = readAll(client, WeightRecord::class, start)
                val fats = readAll(client, BodyFatRecord::class, start)
                    .filter { it.metadata.dataOrigin.packageName != packageName }

                val byDate = sortedMapOf<String, JSONObject>()
                for (r in weights) {
                    val d = localDate(r.time)
                    if (d !in byDate) byDate[d] = JSONObject().put("date", d).put("weight", round1(r.weight.inKilograms))
                }
                for (r in fats) {
                    val o = byDate[localDate(r.time)] ?: continue
                    if (!o.has("fat")) o.put("fat", round1(r.percentage.value))
                }

                send(
                    JSONObject()
                        .put("status", "ok")
                        .put("interactive", interactive)
                        .put("history", HISTORY_PERMISSION in granted)
                        .put("records", JSONArray(byDate.values))
                )
            } catch (e: Exception) {
                send(JSONObject().put("status", "error").put("message", e.message ?: e.toString()))
            }
        }
    }

    /**
     * 体脂肪率を Health Connect に書き込む。json は [{date, fat}] で、fat が null の日は削除する。
     * 日付ごとに clientRecordId を固定しているので、同じ日を書き直すと上書きになる。
     */
    private fun writeFat(json: String, interactive: Boolean) {
        if (HealthConnectClient.getSdkStatus(this, HC_PACKAGE) != HealthConnectClient.SDK_AVAILABLE) return
        val client = HealthConnectClient.getOrCreate(this)
        lifecycleScope.launch {
            try {
                if (fatWritePermission !in client.permissionController.getGrantedPermissions()) {
                    if (interactive) {
                        pendingFatJson = json
                        writePermissionLauncher.launch(setOf(fatWritePermission))
                    } else sendWrite(JSONObject().put("status", "need_write_permission"))
                    return@launch
                }

                val zone = ZoneId.systemDefault()
                val now = Instant.now()
                val version = System.currentTimeMillis()
                val items = JSONArray(json)
                val inserts = mutableListOf<BodyFatRecord>()
                val deletes = mutableListOf<String>()
                for (i in 0 until items.length()) {
                    val o = items.getJSONObject(i)
                    val date = o.getString("date")
                    val id = "weightlog-fat-$date"
                    if (o.isNull("fat")) {
                        deletes += id
                        continue
                    }
                    // 朝7時の測定として記録 (未来の時刻にはしない)
                    val at = LocalDate.parse(date).atTime(7, 0).atZone(zone).toInstant().let { if (it.isAfter(now)) now else it }
                    inserts += BodyFatRecord(
                        time = at,
                        zoneOffset = zone.rules.getOffset(at),
                        percentage = Percentage(o.getDouble("fat")),
                        metadata = Metadata.manualEntry(clientRecordId = id, clientRecordVersion = version),
                    )
                }
                if (inserts.isNotEmpty()) client.insertRecords(inserts)
                if (deletes.isNotEmpty()) client.deleteRecords(BodyFatRecord::class, emptyList(), deletes)

                sendWrite(
                    JSONObject()
                        .put("status", "ok")
                        .put("interactive", interactive)
                        .put("written", inserts.size)
                        .put("deleted", deletes.size)
                        .put("items", items)
                )
            } catch (e: Exception) {
                sendWrite(JSONObject().put("status", "error").put("message", e.message ?: e.toString()))
            }
        }
    }

    private fun sendWrite(o: JSONObject) = runOnUiThread {
        web.evaluateJavascript("window.onHealthConnectWrite && window.onHealthConnectWrite($o)", null)
    }

    private suspend fun <T : Record> readAll(client: HealthConnectClient, type: KClass<T>, start: Instant): List<T> {
        val out = mutableListOf<T>()
        var token: String? = null
        do {
            val res = client.readRecords(
                ReadRecordsRequest(recordType = type, timeRangeFilter = TimeRangeFilter.after(start), pageToken = token)
            )
            out += res.records
            token = res.pageToken
        } while (token != null)
        return out
    }

    // 測定時刻はスマホのタイムゾーン (日本時間) で日付にする。
    // AiLink は時刻を UTC で書き込むことがあり、記録側のオフセットを使うと朝の測定が前日扱いになる。
    private fun localDate(time: Instant): String = time.atZone(ZoneId.systemDefault()).toLocalDate().toString()

    private fun round1(v: Double): Double = (v * 10).roundToInt() / 10.0

    private fun send(o: JSONObject) = runOnUiThread {
        web.evaluateJavascript("window.onHealthConnect && window.onHealthConnect($o)", null)
    }

    private fun applyBars(dark: Boolean) {
        root.setBackgroundColor(Color.parseColor(if (dark) "#0B0F1A" else "#F8FAFC"))
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
        }
    }

    /** ページの JavaScript から window.HealthBridge として呼ばれる */
    inner class Bridge {
        @JavascriptInterface
        fun sync(interactive: Boolean) = runOnUiThread { this@MainActivity.sync(interactive) }

        @JavascriptInterface
        fun writeFat(json: String, interactive: Boolean) = runOnUiThread { this@MainActivity.writeFat(json, interactive) }

        @JavascriptInterface
        fun setTheme(dark: Boolean) = runOnUiThread { applyBars(dark) }

        @JavascriptInterface
        fun saveFile(name: String, text: String) = runOnUiThread {
            pendingSaveText = text
            saveLauncher.launch(name)
        }

        @JavascriptInterface
        fun openHealthConnect() = runOnUiThread {
            try {
                startActivity(Intent(HealthConnectClient.getHealthConnectManageDataIntent(this@MainActivity)))
            } catch (_: Exception) {
                openExternal(Uri.parse("market://details?id=$HC_PACKAGE"))
            }
        }
    }
}
