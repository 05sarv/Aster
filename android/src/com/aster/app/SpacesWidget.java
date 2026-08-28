package com.aster.app;

import android.content.Context;

/** Home-screen widget: the user's Spaces — tap one to open it directly. */
public class SpacesWidget extends ListWidget {
    static void updateAll(Context ctx) { push(ctx, new SpacesWidget()); }

    @Override protected String key() { return "spaces"; }
    @Override protected String route() { return "spaces"; }
    @Override protected String emptyText() { return "Add a space in ASTER"; }
}
