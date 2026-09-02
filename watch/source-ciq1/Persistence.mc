import Toybox.Application;
import Toybox.Lang;

// Connect IQ 1.x backing store (fr230 and friends). Application.Storage and
// Application.Properties do not exist there — the compiler accepts them but
// the device raises "Symbol Not Found" at runtime. The 1.x object store is
// reached through the app instance, and settings share that one namespace.
module Persistence {

    function readValue(key as String) as Object? {
        return Application.getApp().getProperty(key);
    }

    function writeValue(key as String, value as Object) as Void {
        Application.getApp().setProperty(key, value);
    }

    function readSetting(key as String) as Object? {
        return Application.getApp().getProperty(key);
    }
}
