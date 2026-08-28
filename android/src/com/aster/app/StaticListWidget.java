package com.aster.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Static-row list widget: the rows are plain RemoteViews children rendered
 * directly by updateAppWidget — no service, no factory binding, so every
 * refresh is applied immediately by every launcher. Ring tap → broadcast to
 * WidgetClickReceiver (act); row tap → open ASTER.
 */
public abstract class StaticListWidget extends AppWidgetProvider {

    protected static final int MAX_ROWS = 4;

    protected abstract String key();      // section in the data JSON
    protected abstract String route();    // default tap route
    protected abstract String label();    // small header, so you know which widget it is
    protected abstract String emptyText();

    /** Refresh every instance of a widget subclass. */
    protected static void push(Context ctx, StaticListWidget w) {
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
        JSONArray arr = items(ctx);
        int layout = rid(ctx, "widget_list", "layout");
        for (int widgetId : appWidgetIds) {
            RemoteViews v = new RemoteViews(ctx.getPackageName(), layout);
            String label = label();
            v.setTextViewText(rid(ctx, "w_title", "id"), label);
            v.setViewVisibility(rid(ctx, "w_title", "id"), label.isEmpty() ? View.GONE : View.VISIBLE);
            int rows = Math.min(arr.length(), MAX_ROWS);
            for (int i = 0; i < MAX_ROWS; i++) {
                int rowId = rid(ctx, "row_" + (i + 1), "id");
                int iconId = rid(ctx, "row_icon_" + (i + 1), "id");
                if (i < rows) {
                    JSONObject it = arr.optJSONObject(i);
                    String name = it != null ? it.optString("name", "") : "";
                    String emoji = it != null ? it.optString("emoji", "") : "";
                    String spaceId = it != null ? it.optString("spaceId", "") : "";
                    String rowRoute = it != null && it.has("route") ? it.optString("route") : route();

                    v.setInt(iconId, "setBackgroundResource", 0);
                    v.setTextViewText(iconId, emoji);
                    v.setTextViewText(rid(ctx, "row_name_" + (i + 1), "id"), name);
                    v.setViewVisibility(rowId, View.VISIBLE);
                    // the whole row is one thing: open this view of ASTER
                    v.setOnClickPendingIntent(rowId, ListWidget.pi(ctx, rowRoute, (rowRoute + i).hashCode(),
                        spaceId.isEmpty() ? null : spaceId));
                } else {
                    v.setViewVisibility(rowId, View.GONE);
                }
            }
            v.setTextViewText(rid(ctx, "w_empty", "id"), emptyText());
            v.setViewVisibility(rid(ctx, "w_empty", "id"), rows == 0 ? View.VISIBLE : View.GONE);
            am.updateAppWidget(widgetId, v);
        }
    }

    private JSONArray items(Context ctx) {
        try {
            JSONArray a = new JSONObject(ctx.getSharedPreferences("aster_widget", Context.MODE_PRIVATE)
                .getString("data", "{}")).optJSONArray(key());
            return a != null ? a : new JSONArray();
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static int rid(Context ctx, String name, String type) {
        return ctx.getResources().getIdentifier(name, type, ctx.getPackageName());
    }
}
