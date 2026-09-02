import Toybox.Application;
import Toybox.Communications;
import Toybox.Lang;

// Owns the in-flight web request. This is a class rather than plain module
// functions because makeWebRequest needs a bound method() as its callback,
// and a module cannot provide one.
class SyncSession {

    private var _inFlight as Boolean = false;

    function initialize() {
    }

    function isBusy() as Boolean {
        return _inFlight;
    }

    function send(url as String, token as String, batch as Array) as Void {
        _inFlight = true;
        Communications.makeWebRequest(
            url,
            { "sessions" => batch },
            {
                :method  => Communications.HTTP_REQUEST_METHOD_POST,
                :headers => {
                    "Content-Type"  => Communications.REQUEST_CONTENT_TYPE_JSON,
                    "Authorization" => "Bearer " + token
                },
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            method(:_onResponse)
        );
    }

    function _onResponse(code as Number, data as Dictionary?) as Void {
        _inFlight = false;

        if (code != 200 || data == null) {
            // Leave everything unsynced; the next attempt retries.
            return;
        }

        // Mark only what the server actually took.
        var accepted = data["accepted"];
        if (accepted instanceof Array) {
            SessionStorage.markSynced(accepted as Array);
        }
        // Ids the server judged invalid are marked too — retrying them forever
        // would block every later session behind a permanently bad record.
        var rejected = data["rejected"];
        if (rejected instanceof Array) {
            SessionStorage.markSynced(rejected as Array);
        }
    }
}

// Pushes finished sleep sessions to the backend. Sessions stay in local
// storage until the server confirms them, so a failed upload just means the
// next attempt retries — nothing is lost while the watch is offline.
module SyncManager {

    // One batch per request keeps the payload inside the watch's memory
    // budget; the backend rejects anything larger anyway.
    const MAX_BATCH = 50;

    var _session as SyncSession? = null;

    function syncUnsynced() as Void {
        if (_session == null) {
            _session = new SyncSession();
        }
        var session = _session as SyncSession;

        // A second request would re-send what the first is already uploading.
        if (session.isBusy()) {
            return;
        }

        var pending = SessionStorage.getUnsynced();
        if (pending.size() == 0) {
            return;
        }

        var url   = Persistence.readSetting("serverUrl");
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
                "id"      => s["id"],
                "start"   => s["start"],
                "end"     => s["end"],
                "wakeUps" => s["wakeUps"]
            });
        }

        session.send(url as String, token as String, batch);
    }
}
