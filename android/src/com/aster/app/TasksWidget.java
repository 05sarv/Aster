package com.aster.app;

import android.content.Context;

/** Home-screen widget: what's due today (and overdue). */
public class TasksWidget extends StaticListWidget {
    static void updateAll(Context ctx) { StaticListWidget.push(ctx, new TasksWidget()); }

    @Override protected String key() { return "tasks"; }
    @Override protected String label() { return "Tasks"; }
    @Override protected String route() { return "tasks"; }
    @Override protected String emptyText() { return "All clear"; }
}
