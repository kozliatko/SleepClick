import Toybox.Application;
import Toybox.Lang;
import Toybox.Time;

module SessionStorage {

    const STORAGE_KEY  = "sessions";
    const MAX_SESSIONS = 60;

    function save(start as Time.Moment, end as Time.Moment, wakeUps as Number) as Void {
        var sessions = _load();

        sessions.add({
            "id"      => start.value(),
            "start"   => start.value(),
            "end"     => end.value(),
            "wakeUps" => wakeUps,
            "synced"  => false
        });

        // Keep only the newest MAX_SESSIONS entries
        if (sessions.size() > MAX_SESSIONS) {
            sessions = sessions.slice(sessions.size() - MAX_SESSIONS, null);
        }

        Persistence.writeValue(STORAGE_KEY, sessions);
    }

    function getAll() as Array {
        return _load();
    }

    function getUnsynced() as Array {
        var all      = _load();
        var result   = [] as Array;
        for (var i = 0; i < all.size(); i++) {
            var s = all[i] as Dictionary;
            if (!(s["synced"] as Boolean)) {
                result.add(s);
            }
        }
        return result;
    }

    function markSynced(ids as Array) as Void {
        var sessions = _load();
        for (var i = 0; i < sessions.size(); i++) {
            var s = sessions[i] as Dictionary;
            for (var j = 0; j < ids.size(); j++) {
                if ((s["id"] as Number) == (ids[j] as Number)) {
                    s["synced"] = true;
                }
            }
        }
        Persistence.writeValue(STORAGE_KEY, sessions);
    }

    function _load() as Array {
        var stored = Persistence.readValue(STORAGE_KEY);
        if (stored instanceof Array) {
            return stored as Array;
        }
        return [] as Array;
    }
}
