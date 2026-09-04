import Toybox.Lang;
import Toybox.WatchUi;

//! Turns button presses into state changes on the main view.
class MainDelegate extends WatchUi.BehaviorDelegate {

    //! The view this delegate drives
    private var _view as MainView;

    //! Constructor
    //! @param view The view to drive
    public function initialize(view as MainView) {
        BehaviorDelegate.initialize();
        _view = view;
    }

    //! START/STOP button — toggle the sleep state.
    //! @return true, the press is handled here
    public function onSelect() as Boolean {
        if (_view.isSleeping()) {
            _view.stopSleep();
        } else {
            _view.startSleep();
        }
        return true;
    }

    //! DOWN button — count one wake-up. Returning true swallows the key so it
    //! does not fall through to NEXT_PAGE. The fr935 has no LAP key (only
    //! ENTER, UP, MENU, DOWN, ESC), so KEY_LAP would never match here.
    //! @param keyEvent The key press
    //! @return true when the press was handled here
    public function onKey(keyEvent as WatchUi.KeyEvent) as Boolean {
        if (keyEvent.getKey() == WatchUi.KEY_DOWN) {
            _view.addWakeUp();
            return true;
        }
        return BehaviorDelegate.onKey(keyEvent);
    }
}
