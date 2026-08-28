package com.aster.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Widget row taps from the scrollable spaces list land here and open ASTER
 * at the tapped space (or view). Static widgets use direct activity
 * PendingIntents and don't come through here.
 */
public class WidgetClickReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context ctx, Intent it) {
        String spaceId = it.getStringExtra("spaceId");
        String route = it.getStringExtra("route");
        Intent open = new Intent(ctx, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (spaceId != null && !spaceId.isEmpty()) open.putExtra("spaceId", spaceId);
        else if (route != null && !route.isEmpty()) open.putExtra("route", route);
        ctx.startActivity(open);
    }

    static void refreshWidgets(Context ctx) {
        SpacesWidget.updateAll(ctx);
        TasksWidget.updateAll(ctx);
        GoalsWidget.updateAll(ctx);
        RemindersWidget.updateAll(ctx);
        HomeWidget.updateAll(ctx);
    }
}
