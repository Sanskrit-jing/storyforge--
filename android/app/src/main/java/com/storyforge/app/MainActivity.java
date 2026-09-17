package com.storyforge.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must be registered before super.onCreate(), which is where the Bridge is built.
        registerPlugin(SafFolderPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
