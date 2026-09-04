import Toybox.Graphics;
import Toybox.Lang;
import Toybox.Math;
import Toybox.System;
import Toybox.Time;
import Toybox.Timer;
import Toybox.WatchUi;

//! The app's only screen: a clock, the sleep state, and a live timer while a
//! sleep is running.
class MainView extends WatchUi.View {

    //! Whether a sleep is currently being recorded
    private var _sleeping as Boolean = false;
    //! When the running sleep began, null when awake
    private var _start as Time.Moment?;
    //! Wake-ups counted during the running sleep
    private var _wakeUps as Number = 0;
    //! Length of the running sleep, in seconds
    private var _elapsed as Number = 0;
    //! Drives the once-a-second redraw
    private var _timer as Timer.Timer;

    // Strings are read once here rather than on every draw: onUpdate runs
    // once a second, and loadResource is not free.
    //! "asleep" state label
    private var _asleep as String;
    //! "awake" state label
    private var _awake as String;
    //! Unit label under the timer
    private var _units as String;
    //! Prefix of the wake-up counter
    private var _wakeUpsLabel as String;
    //! Button hints for the sleeping screen, longest variant first
    private var _hintSleep as Array<String>;
    //! Button hints for the awake screen, longest variant first
    private var _hintAwake as Array<String>;

    //! Constructor
    public function initialize() {
        View.initialize();
        _timer = new Timer.Timer();

        _asleep = WatchUi.loadResource(Rez.Strings.StateAsleep) as String;
        _awake = WatchUi.loadResource(Rez.Strings.StateAwake) as String;
        _units = WatchUi.loadResource(Rez.Strings.TimerUnits) as String;
        _wakeUpsLabel = WatchUi.loadResource(Rez.Strings.LabelWakeUps) as String;
        _hintSleep = [
            WatchUi.loadResource(Rez.Strings.HintSleepLong) as String,
            WatchUi.loadResource(Rez.Strings.HintSleepMid) as String,
            WatchUi.loadResource(Rez.Strings.HintSleepShort) as String
        ] as Array<String>;
        _hintAwake = [
            WatchUi.loadResource(Rez.Strings.HintAwakeLong) as String,
            WatchUi.loadResource(Rez.Strings.HintAwakeMid) as String,
            WatchUi.loadResource(Rez.Strings.HintAwakeShort) as String
        ] as Array<String>;
    }

    //! Handle the layout being loaded
    //! @param dc Draw context
    public function onLayout(dc as Graphics.Dc) as Void {
    }

    //! Start the redraw timer when the view becomes visible
    public function onShow() as Void {
        _timer.start(method(:onTick), 1000, true);
    }

    //! Stop the redraw timer when the view is hidden
    public function onHide() as Void {
        _timer.stop();
    }

    //! Recompute the elapsed time and ask for a redraw. Public because the
    //! timer needs a bound method() to call.
    public function onTick() as Void {
        if (_sleeping && _start != null) {
            _elapsed = Time.now().subtract(_start as Time.Moment).value();
        }
        WatchUi.requestUpdate();
    }

    //! Draw the screen
    //! @param dc Draw context
    public function onUpdate(dc as Graphics.Dc) as Void {
        var w = dc.getWidth();
        var h = dc.getHeight();

        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_BLACK);
        dc.clear();

        _drawClock(dc, w, h);

        if (_sleeping) {
            _drawSleeping(dc, w, h);
        } else {
            _drawAwake(dc, w, h);
        }
    }

    //! Begin recording a sleep.
    public function startSleep() as Void {
        _sleeping = true;
        _start = Time.now();
        _wakeUps = 0;
        _elapsed = 0;
        WatchUi.requestUpdate();
    }

    //! Finish the running sleep, store it, and try to upload it.
    public function stopSleep() as Void {
        if (_sleeping && _start != null) {
            SessionStorage.save(_start as Time.Moment, Time.now(), _wakeUps);
            SyncManager.syncUnsynced();
        }
        _sleeping = false;
        _start = null;
        _elapsed = 0;
        WatchUi.requestUpdate();
    }

    //! Count one more wake-up. Ignored while awake.
    public function addWakeUp() as Void {
        if (_sleeping) {
            _wakeUps += 1;
            WatchUi.requestUpdate();
        }
    }

    //! Whether a sleep is being recorded.
    //! @return true while a sleep is running
    public function isSleeping() as Boolean {
        return _sleeping;
    }

    //! Draw the current time of day at the top of the screen.
    //! @param dc Draw context
    //! @param w Screen width
    //! @param h Screen height
    private function _drawClock(dc as Graphics.Dc, w as Number, h as Number) as Void {
        var now = System.getClockTime();
        var hour = now.hour;

        if (!System.getDeviceSettings().is24Hour) {
            hour = hour % 12;
            if (hour == 0) {
                hour = 12;
            }
        }

        dc.setColor(Palette.CLOCK, Graphics.COLOR_TRANSPARENT);
        dc.drawText(w / 2, h * 16 / 100, Graphics.FONT_NUMBER_MEDIUM,
            hour.format("%d") + ":" + now.min.format("%02d"),
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    //! Draw the running-sleep screen: state, timer, wake-ups, button hints.
    //! @param dc Draw context
    //! @param w Screen width
    //! @param h Screen height
    private function _drawSleeping(dc as Graphics.Dc, w as Number, h as Number) as Void {
        var cx = w / 2;

        // Status label
        dc.setColor(Palette.DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h * 32 / 100, Graphics.FONT_XTINY, _asleep,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // Live timer — big amber digits
        var hours = _elapsed / 3600;
        var minutes = (_elapsed % 3600) / 60;
        var seconds = _elapsed % 60;
        var timeStr = hours.toString() + ":" + minutes.format("%02d")
                    + ":" + seconds.format("%02d");
        // Moon icon and digits are centred as one group, so the pair stays
        // balanced as the timer grows from "0:00:00" to "12:00:00".
        var timerY = h * 47 / 100;
        var moonR = 13;
        var gap = 10;
        var textW = dc.getTextWidthInPixels(timeStr, Graphics.FONT_NUMBER_MILD);
        var left = cx - (2 * moonR + gap + textW) / 2;

        _drawMoon(dc, left + moonR, timerY, moonR);

        dc.setColor(Palette.TIMER, Graphics.COLOR_TRANSPARENT);
        dc.drawText(left + 2 * moonR + gap, timerY, Graphics.FONT_NUMBER_MILD, timeStr,
            Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);

        // Unit label
        dc.setColor(Palette.DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h * 61 / 100, Graphics.FONT_XTINY, _units,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // Divider
        var divY = h * 69 / 100;
        dc.setColor(Palette.LINE, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(w / 4, divY, w * 3 / 4, divY);

        // Wake-up counter
        dc.setColor(Palette.MUTED, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h * 77 / 100, Graphics.FONT_XTINY,
            _wakeUpsLabel + " " + _wakeUps.toString() + "x",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // Button hints — the round bezel narrows sharply here, so pick the
        // longest variant that still fits the chord at this height.
        var hintY = h * 89 / 100;
        var hint = _fitText(dc, Graphics.FONT_XTINY, _usableWidth(w, h, hintY),
            _hintSleep);
        dc.setColor(Palette.DIM, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, hintY, Graphics.FONT_XTINY, hint,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    //! Draw the awake screen: sun, state label, button hint.
    //! @param dc Draw context
    //! @param w Screen width
    //! @param h Screen height
    private function _drawAwake(dc as Graphics.Dc, w as Number, h as Number) as Void {
        var cx = w / 2;

        // Sun and label are centred as one group, mirroring the moon + timer
        // pairing on the sleeping screen.
        var stateY = h * 42 / 100;
        var sunR = 14;
        var gap = 12;
        // Translations vary a lot in length -- "WACH" against "DESPIERTO" --
        // so drop a font size rather than let the label run off the bezel.
        var font = Graphics.FONT_MEDIUM;
        var textW = dc.getTextWidthInPixels(_awake, font);
        if (2 * sunR + gap + textW > _usableWidth(w, h, stateY)) {
            font = Graphics.FONT_SMALL;
            textW = dc.getTextWidthInPixels(_awake, font);
        }
        var left = cx - (2 * sunR + gap + textW) / 2;

        _drawSun(dc, left + sunR, stateY, sunR);

        dc.setColor(Palette.STATE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(left + 2 * sunR + gap, stateY, font, _awake,
            Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);

        var hintY = h * 66 / 100;
        var hint = _fitText(dc, Graphics.FONT_XTINY, _usableWidth(w, h, hintY),
            _hintAwake);
        dc.setColor(Palette.MUTED, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, hintY, Graphics.FONT_XTINY, hint,
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);
    }

    //! Crescent moon: a filled disc with a second, offset disc punched back
    //! out of it in the background colour.
    //! @param dc Draw context
    //! @param cx Centre x
    //! @param cy Centre y
    //! @param r Disc radius
    private function _drawMoon(dc as Graphics.Dc, cx as Number, cy as Number,
                               r as Number) as Void {
        dc.setColor(Palette.MOON, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx, cy, r);
        dc.setColor(Graphics.COLOR_BLACK, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx + r * 45 / 100, cy - r * 30 / 100, r * 85 / 100);
    }

    //! Sun: a solid core with eight rays.
    //! @param dc Draw context
    //! @param cx Centre x
    //! @param cy Centre y
    //! @param r Outer radius the rays reach
    private function _drawSun(dc as Graphics.Dc, cx as Number, cy as Number,
                              r as Number) as Void {
        dc.setColor(Palette.SUN, Graphics.COLOR_TRANSPARENT);
        dc.fillCircle(cx, cy, r * 55 / 100);

        var inner = r * 78 / 100;
        dc.setPenWidth(2);
        for (var i = 0; i < 8; i += 1) {
            var a = i * Math.PI / 4.0;
            var c = Math.cos(a);
            var s = Math.sin(a);
            dc.drawLine((cx + inner * c).toNumber(), (cy + inner * s).toNumber(),
                        (cx + r * c).toNumber(), (cy + r * s).toNumber());
        }
        dc.setPenWidth(1);
    }

    //! Horizontal space available at a given height. On a round screen this is
    //! the chord of the display circle, which shrinks toward the top and
    //! bottom. A semi-round screen is the same circle with the top and bottom
    //! sliced off, so the identical chord formula applies — only w != h there.
    //! @param w Screen width
    //! @param h Screen height
    //! @param y Height to measure at
    //! @return Usable width in pixels
    private function _usableWidth(w as Number, h as Number, y as Number) as Number {
        var shape = System.getDeviceSettings().screenShape;
        if (shape != System.SCREEN_SHAPE_ROUND && shape != System.SCREEN_SHAPE_SEMI_ROUND) {
            return w;
        }
        var r = w / 2;
        var dy = y - h / 2;
        if (dy < 0) {
            dy = -dy;
        }
        if (dy >= r) {
            return 0;
        }
        return (2 * Math.sqrt(r * r - dy * dy)).toNumber();
    }

    //! Pick the first candidate string that fits the given width.
    //! @param dc Draw context
    //! @param font Font the text will be drawn in
    //! @param maxWidth Space available, in pixels
    //! @param candidates Variants from longest to shortest
    //! @return The first variant that fits, or the shortest one
    private function _fitText(dc as Graphics.Dc, font as Graphics.FontType,
                              maxWidth as Number,
                              candidates as Array<String>) as String {
        for (var i = 0; i < candidates.size(); i += 1) {
            if (dc.getTextWidthInPixels(candidates[i], font) <= maxWidth) {
                return candidates[i];
            }
        }
        return candidates[candidates.size() - 1];
    }
}
