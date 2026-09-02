import Toybox.Application;
import Toybox.Lang;
import Toybox.WatchUi;

class SleepClickApp extends Application.AppBase {

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
        // Retry anything left over from a session that was recorded while the
        // watch had no connectivity.
        SyncManager.syncUnsynced();
    }

    function onStop(state as Dictionary?) as Void {
    }

    function getInitialView() as [WatchUi.Views] or [WatchUi.Views, WatchUi.InputDelegates] {
        var view = new MainView();
        return [view, new MainDelegate(view)];
    }
}
