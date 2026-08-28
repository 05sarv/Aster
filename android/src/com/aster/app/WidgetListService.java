package com.aster.app;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Feeds rows to the scrollable spaces widget. Each item in the widget data
 * may carry: name / emoji — what to show; route | spaceId — where tapping
 * the row opens. Widgets never mutate data; taps only open ASTER.
 */
public class WidgetListService extends RemoteViewsService {

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        // key arrives as an extra; some launchers drop extras on rebind and
        // only keep the data URI — read it from either.
        String key = intent.getStringExtra("key");
        if (key == null && intent.getData() != null) key = intent.getData().getHost();
        return new Factory(getApplication(), key);
    }

    private static class Factory implements RemoteViewsFactory {
        private final Context ctx;
        private final String key;
        private JSONArray items = new JSONArray();

        Factory(Context ctx, String key) {
            this.ctx = ctx;
            // no key at all → spaces is the safest guess (was the first widget)
            this.key = key != null ? key : "spaces";
        }

        @Override
        public void onDataSetChanged() {
            try {
                String json = ctx.getSharedPreferences("aster_widget", Context.MODE_PRIVATE).getString("data", "{}");
                JSONArray arr = new JSONObject(json).optJSONArray(key);
                items = arr != null ? arr : new JSONArray();
            } catch (Exception e) {
                items = new JSONArray();
            }
        }

        @Override
        public int getCount() { return items.length(); }

        @Override
        public RemoteViews getViewAt(int pos) {
            RemoteViews rv = new RemoteViews(ctx.getPackageName(), rid("widget_row", "layout"));
            JSONObject it = items.optJSONObject(pos);
            if (it == null) return rv;
            String name = it.optString("name", "");
            String emoji = it.optString("emoji", "");
            String spaceId = it.optString("spaceId", "");
            String route = it.optString("route", "");

            rv.setTextViewText(rid("r_icon", "id"), emoji);
            rv.setTextViewText(rid("r_name", "id"), name);

            Intent open = new Intent();
            if (!spaceId.isEmpty()) open.putExtra("spaceId", spaceId);
            else if (!route.isEmpty()) open.putExtra("route", route);
            rv.setOnClickFillInIntent(rid("w_row", "id"), open);

            return rv;
        }

        @Override public void onCreate() {}
        @Override public void onDestroy() {}
        @Override public long getItemId(int pos) { return pos; }
        @Override public boolean hasStableIds() { return false; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public RemoteViews getLoadingView() { return null; }

        private int rid(String name, String type) {
            return ctx.getResources().getIdentifier(name, type, ctx.getPackageName());
        }
    }
}
