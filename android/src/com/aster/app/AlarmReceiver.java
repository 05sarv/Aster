package com.aster.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Fires a reminder notification at its scheduled time — even with the app closed. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        String title = intent.getStringExtra("title");
        String body = intent.getStringExtra("body");
        MainActivity.postNotification(ctx, title == null ? "ASTER ✦" : title, body == null ? "" : body);
    }
}
