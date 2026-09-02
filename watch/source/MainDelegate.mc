import Toybox.Lang;
import Toybox.WatchUi;

class MainDelegate extends WatchUi.BehaviorDelegate {

    private var _view as MainView;

    function initialize(view as MainView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    // START/STOP button → toggle sleep state
    function onSelect() as Boolean {
        if (_view.isSleeping()) {
            _view.stopSleep();
        } else {
            _view.startSleep();
        }
        return true;
    }

    // DOWN button → +1 wake-up. Returning true swallows the key so it does
    // not fall through to NEXT_PAGE. fr935 has no LAP key (only ENTER, UP,
    // MENU, DOWN, ESC), so KEY_LAP would never match here.
    function onKey(keyEvent as WatchUi.KeyEvent) as Boolean {
        if (keyEvent.getKey() == WatchUi.KEY_DOWN) {
            _view.addWakeUp();
            return true;
        }
        return BehaviorDelegate.onKey(keyEvent);
    }
}
