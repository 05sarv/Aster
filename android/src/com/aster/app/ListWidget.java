package com.aster.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

/**
 * Shared base for ASTER's compact list widgets (2x1, scrollable).
 * Rows come from WidgetListService; tapping a row opens ASTER at its route,
 * tapping the ◯ acts on it (see WidgetClickReceiver). The whole card also
 * opens the widget's default view.
 */
public abstract class ListWidget extends AppWidgetProvider {

    protected abstract String key();      // section in the data JSON
    protected abstract String route();    // default tap route ("tasks", "goals"…)
    protected abstract String emptyText();

    /** Refresh every instance of a widget subclass. */
    protected static void push(Context ctx, ListWidget w) {
        try {
            AppWidgetManager am = AppWidgetManager.getInstance(ctx);
            if (am == null) return;
            int[] ids = am.getAppWidgetIds(new ComponentName(ctx, w.getClass()));
            if (ids == null || ids.length == 0) return;
            w.onUpdate(ctx, am, ids);
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onUpdate(Context ctx, AppWidgetManager am, int[] appWidgetIds) {
        int layout = rid(ctx, "widget_scroll", "layout");
        int listId = rid(ctx, "w_list", "id");
        // bump on every data change — a new URI forces launchers to rebind
        // the row factory and actually re-render (notifyAppWidgetViewDataChanged
        // alone is ignored by stale bindings)
        long rev = rev(ctx);
        for (int widgetId : appWidgetIds) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), layout);

            Intent svc = new Intent(ctx, WidgetListService.class)
                .putExtra("key", key())
                .setData(android.net.Uri.parse("aster-widget://" + key() + "/" + widgetId + "?r=" + rev));
            v.setRemoteAdapter(listId, svc);
            v.setEmptyView(listId, rid(ctx, "w_empty", "id"));
            v.setTextViewText(rid(ctx, "w_empty", "id"), emptyText());

            // rows: broadcast template — WidgetClickReceiver opens or acts.
            // must be MUTABLE: immutable PendingIntants ignore per-row fill-in
            // extras, so every tap would just open the app.
            Intent tmpl = new Intent(ctx, WidgetClickReceiver.class);
            v.setPendingIntentTemplate(listId, PendingIntent.getBroadcast(ctx, key().hashCode(), tmpl,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE));

            // empty area of the card → open this widget's view
            v.setOnClickPendingIntent(rid(ctx, "w_root", "id"), pi(ctx, route(), route().hashCode(), null));

            am.updateAppWidget(widgetId, v);
            am.notifyAppWidgetViewDataChanged(widgetId, listId);
        }
    }

    /** Open ASTER at a route — or deep into a space when spaceId is set. */
    static PendingIntent pi(Context ctx, String route, int code, String spaceId) {
        Intent it = new Intent(ctx, MainActivity.class);
        if (route != null) it.putExtra("route", route);
        if (spaceId != null && !spaceId.isEmpty()) it.putExtra("spaceId", spaceId);
        it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(ctx, code, it,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Resource lookup without R.java (keeps the build package-agnostic). */
    static int rid(Context ctx, String name, String type) {
        return ctx.getResources().getIdentifier(name, type, ctx.getPackageName());
    }

    /** Monotonic data revision — bump it whenever "data" changes. */
    static long rev(Context ctx) {
        return ctx.getSharedPreferences("aster_widget", Context.MODE_PRIVATE).getLong("rev", 0);
    }

    static void bumpRev(Context ctx) {
        ctx.getSharedPreferences("aster_widget", Context.MODE_PRIVATE)
            .edit().putLong("rev", rev(ctx) + 1).apply();
    }
}
