package com.storyforge.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Storage Access Framework bridge for the "local folder backup" feature.
 *
 * Android's WebView has no File System Access API (no window.showDirectoryPicker),
 * so the web layer cannot let the user choose a backup folder on its own. This plugin
 * exposes the minimum needed to keep "auto backup into a folder the user really picked"
 * working on Android:
 *
 *   pickDirectory()   -> ACTION_OPEN_DOCUMENT_TREE + takePersistableUriPermission
 *   checkPermission() -> is the persisted grant still valid
 *   getLabel()        -> human readable name of the granted folder
 *   writeFile()       -> write / replace one text file inside that folder tree
 *   listFiles()       -> read back every matching text file in that folder tree
 *
 * Only framework APIs are used (DocumentsContract + ContentResolver), so no extra
 * Gradle dependency is needed. The grant is persisted by the system, which is what
 * makes the per-project folder binding survive app restarts.
 *
 * NOTE: keep this file ASCII-only. AGP's Java compile encoding is not pinned to UTF-8
 * in this project, so non-ASCII literals could be mangled on a GBK host.
 */
@CapacitorPlugin(name = "SafFolder")
public class SafFolderPlugin extends Plugin {

    /** Same shape the web layer uses to recognise its own backup files. */
    private static final String BACKUP_NAME_PATTERN = "^storyforge-.*\\.json$";

    // ------------------------------------------------------------------ pick

    @PluginMethod
    public void pickDirectory(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION
                | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
                | Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        );
        startActivityForResult(call, intent, "pickDirectoryResult");
    }

    @ActivityCallback
    private void pickDirectoryResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        Intent data = result.getData();
        Uri uri = (result.getResultCode() == Activity.RESULT_OK && data != null) ? data.getData() : null;
        if (uri == null) {
            // User cancelled: resolve with an empty object so the web layer reads it as "not picked".
            call.resolve();
            return;
        }
        try {
            getContext()
                .getContentResolver()
                .takePersistableUriPermission(
                    uri,
                    Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                );
        } catch (SecurityException e) {
            call.reject("Could not keep access to the chosen folder: " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("uri", uri.toString());
        ret.put("label", labelOfTree(uri));
        call.resolve(ret);
    }

    // ------------------------------------------------------------- inspection

    @PluginMethod
    public void checkPermission(PluginCall call) {
        Uri treeUri = treeUriOf(call);
        if (treeUri == null) return;
        JSObject ret = new JSObject();
        ret.put("granted", hasPersistedGrant(treeUri));
        call.resolve(ret);
    }

    @PluginMethod
    public void getLabel(PluginCall call) {
        Uri treeUri = treeUriOf(call);
        if (treeUri == null) return;
        JSObject ret = new JSObject();
        ret.put("label", labelOfTree(treeUri));
        call.resolve(ret);
    }

    // --------------------------------------------------------------- read/write

    @PluginMethod
    public void writeFile(PluginCall call) {
        Uri treeUri = treeUriOf(call);
        if (treeUri == null) return;
        String filename = call.getString("filename");
        String data = call.getString("data");
        if (filename == null || filename.length() == 0) {
            call.reject("filename is required");
            return;
        }
        if (data == null) {
            call.reject("data is required");
            return;
        }
        if (!hasPersistedGrant(treeUri)) {
            call.reject("Access to the saved folder was revoked");
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        try {
            String parentDocId = DocumentsContract.getTreeDocumentId(treeUri);
            Uri docUri = findChildByName(resolver, treeUri, parentDocId, filename);
            if (docUri == null) {
                Uri parentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, parentDocId);
                docUri = DocumentsContract.createDocument(resolver, parentUri, "application/json", filename);
            }
            if (docUri == null) {
                call.reject("Could not create the backup file inside the chosen folder");
                return;
            }
            // "rwt" truncates, so an existing backup is replaced instead of appended to.
            try (OutputStream out = resolver.openOutputStream(docUri, "rwt")) {
                if (out == null) {
                    call.reject("Could not open the backup file for writing");
                    return;
                }
                out.write(data.getBytes(StandardCharsets.UTF_8));
                out.flush();
            }
            JSObject ret = new JSObject();
            ret.put("name", displayNameOf(resolver, docUri));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Could not write the backup file: " + e.getMessage());
        }
    }

    @PluginMethod
    public void listFiles(PluginCall call) {
        Uri treeUri = treeUriOf(call);
        if (treeUri == null) return;
        if (!hasPersistedGrant(treeUri)) {
            call.reject("Access to the saved folder was revoked");
            return;
        }
        ContentResolver resolver = getContext().getContentResolver();
        JSArray files = new JSArray();
        try {
            String parentDocId = DocumentsContract.getTreeDocumentId(treeUri);
            Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId);
            try (
                Cursor cursor = resolver.query(
                    childrenUri,
                    new String[] {
                        DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                        DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    },
                    null,
                    null,
                    null
                )
            ) {
                while (cursor != null && cursor.moveToNext()) {
                    String docId = cursor.getString(0);
                    String name = cursor.getString(1);
                    if (name == null || !name.toLowerCase(Locale.US).matches(BACKUP_NAME_PATTERN)) continue;
                    String text = readText(resolver, DocumentsContract.buildDocumentUriUsingTree(treeUri, docId));
                    if (text == null) continue;
                    JSObject entry = new JSObject();
                    entry.put("name", name);
                    entry.put("text", text);
                    files.put(entry);
                }
            }
        } catch (Exception e) {
            call.reject("Could not read the chosen folder: " + e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("files", files);
        call.resolve(ret);
    }

    // ------------------------------------------------------------------ helpers

    private Uri treeUriOf(PluginCall call) {
        String raw = call.getString("uri");
        if (raw == null || raw.length() == 0) {
            call.reject("uri is required");
            return null;
        }
        return Uri.parse(raw);
    }

    private boolean hasPersistedGrant(Uri uri) {
        for (UriPermission permission : getContext().getContentResolver().getPersistedUriPermissions()) {
            if (permission.getUri().equals(uri) && permission.isReadPermission() && permission.isWritePermission()) {
                return true;
            }
        }
        return false;
    }

    /**
     * Finds an existing child by name. Also accepts a name the provider extended with
     * one extra extension of its own, so the same backup is replaced instead of duplicated
     * on every run.
     */
    private Uri findChildByName(ContentResolver resolver, Uri treeUri, String parentDocId, String filename) {
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parentDocId);
        String wanted = filename.toLowerCase(Locale.US);
        try (
            Cursor cursor = resolver.query(
                childrenUri,
                new String[] {
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                },
                null,
                null,
                null
            )
        ) {
            while (cursor != null && cursor.moveToNext()) {
                String docId = cursor.getString(0);
                String name = cursor.getString(1);
                if (name == null) continue;
                String actual = name.toLowerCase(Locale.US);
                if (actual.equals(wanted) || actual.startsWith(wanted + ".")) {
                    return DocumentsContract.buildDocumentUriUsingTree(treeUri, docId);
                }
            }
        } catch (Exception ignored) {
            // A provider that refuses the child query simply means "not found yet".
        }
        return null;
    }

    private String readText(ContentResolver resolver, Uri uri) {
        try (InputStream in = resolver.openInputStream(uri)) {
            if (in == null) return null;
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[8192];
            int read;
            while ((read = in.read(chunk)) > 0) buffer.write(chunk, 0, read);
            return buffer.toString("UTF-8");
        } catch (Exception e) {
            return null;
        }
    }

    private String displayNameOf(ContentResolver resolver, Uri uri) {
        try (
            Cursor cursor = resolver.query(
                uri,
                new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME },
                null,
                null,
                null
            )
        ) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && name.length() > 0) return name;
            }
        } catch (Exception ignored) {
            // Fall through to the raw document id below.
        }
        return uri.getLastPathSegment() == null ? "" : uri.getLastPathSegment();
    }

    private String labelOfTree(Uri treeUri) {
        ContentResolver resolver = getContext().getContentResolver();
        String docId = DocumentsContract.getTreeDocumentId(treeUri);
        String fromProvider = displayNameOf(resolver, DocumentsContract.buildDocumentUriUsingTree(treeUri, docId));
        // Document ids look like "primary:Documents/StoryForge", which still beats an empty label.
        return fromProvider != null && fromProvider.length() > 0 ? fromProvider : docId;
    }
}
