import Toybox.Application;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;

//! Local record of finished sleep sessions. Entries stay here until the
//! backend confirms them, so nothing is lost while the watch is offline.
//! The backing store is platform specific and reached through Persistence.
module SessionStorage {

    const STORAGE_KEY = "sessions";
    const MAX_SESSIONS = 60;

    //! Append a finished session. Entries beyond MAX_SESSIONS are dropped so
    //! the object store cannot grow without bound.
    //! @param start When the sleep began
    //! @param end When the sleep ended
    //! @param wakeUps Wake-ups counted during the sleep
    function save(start as Time.Moment, end as Time.Moment, wakeUps as Number) as Void {
        var sessions = load();

        sessions.add({
            "id" => start.value(),
            "start" => start.value(),
            "end" => end.value(),
            "wakeUps" => wakeUps,
            "synced" => false
        });

        if (sessions.size() > MAX_SESSIONS) {
            // slice() widens the inferred type, so pin it back to Array.
            sessions = sessions.slice(sessions.size() - MAX_SESSIONS, null) as Array;
        }

        persist(sessions);
    }

    //! Sessions the backend has not confirmed yet.
    //! @return Array of session dictionaries, empty when everything is synced
    function getUnsynced() as Array {
        var all = load();
        var result = [] as Array;
        for (var i = 0; i < all.size(); i += 1) {
            var s = all[i] as Dictionary;
            if (!(s["synced"] as Boolean)) {
                result.add(s);
            }
        }
        return result;
    }

    //! Mark the given session ids as confirmed by the backend.
    //! @param ids Session ids to stop retrying
    function markSynced(ids as Array) as Void {
        var sessions = load();
        for (var i = 0; i < sessions.size(); i += 1) {
            var s = sessions[i] as Dictionary;
            for (var j = 0; j < ids.size(); j += 1) {
                if ((s["id"] as Number) == (ids[j] as Number)) {
                    s["synced"] = true;
                }
            }
        }
        persist(sessions);
    }

    //! Write the session list back to the object store.
    //! The store is size limited and throws once it is full. Letting that
    //! propagate would end the app with an Unhandled Exception in the middle
    //! of recording a sleep, which is worse than losing the write, so it is
    //! caught and logged instead.
    //! @param sessions Full session list to persist
    function persist(sessions as Array) as Void {
        try {
            Persistence.writeValue(STORAGE_KEY, sessions);
        } catch (ex) {
            System.println("SessionStorage: write failed: " + ex.getErrorMessage());
        }
    }

    //! Read the session list from the object store.
    //! @return The stored sessions, or an empty array when there are none
    function load() as Array {
        var stored = Persistence.readValue(STORAGE_KEY);
        if (stored instanceof Array) {
            return stored as Array;
        }
        return [] as Array;
    }
}
