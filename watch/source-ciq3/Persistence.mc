import Toybox.Application;
import Toybox.Lang;

// Connect IQ 2.4+ backing store (fr935 and friends).
// The CIQ 1.x build swaps in source-ciq1/Persistence.mc instead — see
// monkey.jungle. Both files must expose the same three functions.
module Persistence {

    function readValue(key as String) as Object? {
        return Application.Storage.getValue(key);
    }

    function writeValue(key as String, value as Object) as Void {
        Application.Storage.setValue(key, value);
    }

    // App settings live in a separate namespace from here on.
    function readSetting(key as String) as Object? {
        return Application.Properties.getValue(key);
    }
}
