package com.aster.app;

import android.content.Context;

/** Home-screen widget: a quick ASTER summary — tasks, reminders, goals at a glance. */
public class HomeWidget extends StaticListWidget {
    static void updateAll(Context ctx) { StaticListWidget.push(ctx, new HomeWidget()); }

    @Override protected String key() { return "home"; }
    @Override protected String label() { return ""; } // no header — rows only
    @Override protected String route() { return "dashboard"; }
    @Override protected String emptyText() { return "Welcome"; }
}
