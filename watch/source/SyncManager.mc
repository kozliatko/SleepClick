import Toybox.Lang;

//! Pushes finished sleep sessions to the backend. Sessions stay in local
//! storage until the server confirms them, so a failed upload just means the
//! next attempt retries — nothing is lost while the watch is offline.
module SyncManager {

    //! One batch per request keeps the payload inside the watch's memory
    //! budget; the backend rejects anything larger anyway.
    const MAX_BATCH = 50;

    //! Upload in progress, kept across calls so a second sync cannot start
    //! while the first is still outstanding.
    var session as SyncSession?;

    //! Upload everything the backend has not confirmed yet. Does nothing when
    //! an upload is already running, when there is nothing pending, or when
    //! the server URL and token have not been configured.
    function syncUnsynced() as Void {
        if (session == null) {
            session = new SyncSession();
        }
        var current = session as SyncSession;

        // A second request would re-send what the first is already uploading.
        if (current.isBusy()) {
            return;
        }

        var pending = SessionStorage.getUnsynced();
        if (pending.size() == 0) {
            return;
        }

        var url = Persistence.readSetting("serverUrl");
        var token = Persistence.readSetting("syncToken");
        if (!(url instanceof String) || !(token instanceof String)) {
            return;
        }
        if ((url as String).length() == 0 || (token as String).length() == 0) {
            return;
        }

        var batch = [] as Array;
        var count = pending.size() < MAX_BATCH ? pending.size() : MAX_BATCH;
        for (var i = 0; i < count; i += 1) {
            var s = pending[i] as Dictionary;
            // Send only the server's fields — "synced" is local bookkeeping.
            batch.add({
                "id" => s["id"],
                "start" => s["start"],
                "end" => s["end"],
                "wakeUps" => s["wakeUps"]
            });
        }

        current.send(url as String, token as String, batch);
    }
}
