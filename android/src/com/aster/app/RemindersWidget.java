package com.aster.app;

import android.content.Context;

/** Home-screen widget: upcoming reminders. */
public class RemindersWidget extends StaticListWidget {
    static void updateAll(Context ctx) { StaticListWidget.push(ctx, new RemindersWidget()); }

    @Override protected String key() { return "reminders"; }
    @Override protected String label() { return "Reminders"; }
    @Override protected String route() { return "reminders"; }
    @Override protected String emptyText() { return "Nothing scheduled"; }
}
