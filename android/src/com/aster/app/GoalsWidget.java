package com.aster.app;

import android.content.Context;

/** Home-screen widget: active goals. */
public class GoalsWidget extends StaticListWidget {
    static void updateAll(Context ctx) { StaticListWidget.push(ctx, new GoalsWidget()); }

    @Override protected String key() { return "goals"; }
    @Override protected String label() { return "Goals"; }
    @Override protected String route() { return "goals"; }
    @Override protected String emptyText() { return "No goals yet"; }
}
