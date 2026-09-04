import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

//! Sleep tracker for a baby's naps and nights: one button starts and stops a
//! sleep, another counts wake-ups, and finished sessions sync to the backend.
class SleepClickApp extends Application.AppBase {

    //! Constructor
    public function initialize() {
        AppBase.initialize();
    }

    //! Handle app startup
    //! @param state Saved state, unused here
    public function onStart(state as Dictionary?) as Void {
        // Retry anything left over from a session that was recorded while the
        // watch had no connectivity.
        SyncManager.syncUnsynced();
    }

    //! Handle app shutdown
    //! @param state Saved state, unused here
    public function onStop(state as Dictionary?) as Void {
    }

    //! Return the initial view and its input delegate
    //! @return The view and delegate to start with
    public function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        var view = new MainView();
        return [view, new MainDelegate(view)];
    }
}
