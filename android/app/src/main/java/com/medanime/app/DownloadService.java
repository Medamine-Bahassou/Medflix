package com.medanime.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Foreground service that runs while episodes download: it keeps Android from killing the app in the
 * background, and owns the ongoing "downloading" notification with the overall progress bar.
 * DownloaderPlugin does the actual work and calls update()/finished() as it goes.
 */
public class DownloadService extends Service {

    // the progress channel is default importance, kept silent: a low-importance ("silent") one is hidden on the lock screen
    private static final String CHANNEL = "downloads_live", OLD_CHANNEL = "downloads", DONE_CHANNEL = "downloads_done";
    private static final int NOTIFICATION = 4242;

    static class Item {
        final String title;
        volatile long received, total;

        Item(String title) {
            this.title = title;
        }
    }

    static final Map<String, Item> active = new ConcurrentHashMap<>();
    // set by the page so the notification speaks the app's language
    static volatile String labelActive = "Downloading", labelMany = "%d episodes", labelPreparing = "Preparing download…";
    static volatile boolean running;
    // the download queue (DownloaderPlugin.enqueue) still has work, a file downloading or one waiting its turn: stay up
    // between files too. Started from the background, Android 12+ refuses this service, and the next file would then stall
    static volatile boolean held;
    private static final Handler main = new Handler(Looper.getMainLooper());
    // the screen going off lets the CPU and Wi-Fi sleep even with a foreground service: hold both while downloading
    private PowerManager.WakeLock cpu;
    private WifiManager.WifiLock wifi;

    static void start(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationManager nm = c.getSystemService(NotificationManager.class);
            NotificationChannel live = new NotificationChannel(CHANNEL, "Downloads", NotificationManager.IMPORTANCE_DEFAULT);
            live.setSound(null, null);
            live.enableVibration(false);
            live.setShowBadge(false);
            live.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(live);
            nm.deleteNotificationChannel(OLD_CHANNEL); // the low-importance one before: not left in the app's settings
            nm.createNotificationChannel(new NotificationChannel(DONE_CHANNEL, "Finished downloads", NotificationManager.IMPORTANCE_DEFAULT));
        }
        if (running) { // already foreground: Android 12+ refuses a new start while the app is in the background
            update(c);
            return;
        }
        try {
            ContextCompat.startForegroundService(c, new Intent(c, DownloadService.class));
        } catch (Exception e) {
            // not allowed from the background: the download still runs, just without the service's protection
        }
    }

    /** refresh the ongoing notification after progress, or stop once nothing is downloading */
    static void update(Context c) {
        if (active.isEmpty() && !held) {
            // stay up a little: the page queues the next manga chapter as one finishes, maybe from the background
            main.postDelayed(() -> {
                if (active.isEmpty() && !held) c.stopService(new Intent(c, DownloadService.class));
            }, 15000);
            return;
        }
        notify(c, NOTIFICATION, progress(c));
    }

    /** a separate, dismissable notification per finished (or failed) episode */
    static void finished(Context c, String id, String label, String title) {
        notify(
            c,
            id.hashCode(),
            new NotificationCompat.Builder(c, DONE_CHANNEL)
                .setSmallIcon(R.drawable.ic_stat_download)
                .setContentTitle(label)
                .setContentText(title)
                .setContentIntent(openApp(c))
                .setAutoCancel(true)
                .build()
        );
        update(c);
    }

    private static Notification progress(Context c) {
        // one snapshot: downloads are added on their threads and removed on the main one (a pause) while this runs; checking
        // the live map's size, then reading its one item after a pause removed it, crashed the app
        java.util.List<Item> items = new java.util.ArrayList<>(active.values());
        long received = 0, total = 0;
        for (Item i : items) {
            received += i.received;
            total += i.total;
        }
        int pct = total > 0 ? (int) (received * 100 / total) : 0;
        // nothing transferring yet (the file's link being looked up): "Preparing download…", its bar spinning
        String what = items.isEmpty() ? labelPreparing : items.size() == 1 ? items.get(0).title : String.format(labelMany, items.size());
        return new NotificationCompat.Builder(c, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_download)
            .setContentTitle(labelActive)
            .setContentText(what)
            .setSubText(pct + "%")
            .setProgress(100, pct, total <= 0)
            .setContentIntent(openApp(c))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC) // its progress shown on the lock screen too
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE) // Android 12+ would hold it back up to 10s
            .build();
    }

    private static PendingIntent openApp(Context c) {
        Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
        return PendingIntent.getActivity(c, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static void notify(Context c, int id, Notification n) {
        try {
            NotificationManagerCompat.from(c).notify(id, n);
        } catch (SecurityException e) {
            // notifications not allowed by the user: downloads still run
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, progress(this), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(NOTIFICATION, progress(this));
        running = true;
        if (cpu == null) {
            cpu = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "medflix:downloads");
            cpu.acquire();
            wifi = ((WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE)).createWifiLock(
                Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF,
                "medflix:downloads"
            );
            wifi.acquire();
        }
        if (active.isEmpty() && !held) stopSelf(); // everything finished before the service got going
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (cpu != null) cpu.release();
        if (wifi != null) wifi.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
