import Toybox.Application;
import Toybox.Lang;

//! Object store and app settings for Connect IQ 2.4+ devices (fr935 and
//! friends). The Connect IQ 1.x build swaps in source-ciq1/Persistence.mc
//! instead — see monkey.jungle. Both files must expose the same three
//! functions with the same meaning.
module Persistence {

    //! Read a value from the object store.
    //! @param key Key the value was stored under
    //! @return The stored value, or null when the key was never written
    function readValue(key as String) as Object? {
        return Application.Storage.getValue(key);
    }

    //! Write a value to the object store.
    //! The store is size limited per device and setValue throws once that
    //! limit is reached, so callers must handle failure rather than assume
    //! the write succeeded.
    //! @param key Key to store under
    //! @param value Value to store; must be a Storage.ValueType
    function writeValue(key as String, value as Object) as Void {
        // The caller works with the generic Object that both platform
        // variants share; narrowing happens here, where the concrete SDK
        // type is known.
        Application.Storage.setValue(key, value as Application.Storage.ValueType);
    }

    //! Read an app setting. Settings live in their own namespace here, apart
    //! from the object store above.
    //! @param key Property id declared in properties.xml
    //! @return The setting, or null when it was never set
    function readSetting(key as String) as Object? {
        return Application.Properties.getValue(key);
    }
}
