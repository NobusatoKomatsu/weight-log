package io.github.nobusatokomatsu.screenmemo

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** 端末の再起動やアプリの更新のあと、メモの表示を元に戻す */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        Display.refresh(ctx)
    }
}
