import Toybox.Application;
import Toybox.Lang;

//! Object store and app settings for Connect IQ 1.x devices (fr230 and
//! friends). Application.Storage and Application.Properties do not exist
//! there — the compiler accepts them but the device raises "Symbol Not Found"
//! at runtime. The 1.x object store is reached through the app instance, and
//! settings share that one namespace.
//!
//! AppBase.getProperty/setProperty are deprecated in current SDKs and the
//! compiler says so on every build. That warning is expected and cannot be
//! silenced: on a Connect IQ 1.x device these are the only APIs that exist.
module Persistence {

    //! Read a value from the object store.
    //! @param key Key the value was stored under
    //! @return The stored value, or null when the key was never written
    function readValue(key as String) as Object? {
        return Application.getApp().getProperty(key);
    }

    //! Write a value to the object store.
    //! The store is size limited per device and setProperty throws once that
    //! limit is reached, so callers must handle failure rather than assume
    //! the write succeeded.
    //! @param key Key to store under
    //! @param value Value to store; must be a PropertyValueType
    function writeValue(key as String, value as Object) as Void {
        // The caller works with the generic Object that both platform
        // variants share; narrowing happens here, where the concrete SDK
        // type is known.
        Application.getApp().setProperty(key, value as Application.PropertyValueType);
    }

    //! Read an app setting. On Connect IQ 1.x this is the same namespace as
    //! the object store, so keys must not collide with those in
    //! SessionStorage.
    //! @param key Property id declared in properties.xml
    //! @return The setting, or null when it was never set
    function readSetting(key as String) as Object? {
        return Application.getApp().getProperty(key);
    }
}
