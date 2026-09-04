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

    //! Constructor
    public function initialize() {
        View.initialize();
        _timer = new Timer.Timer();
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
        dc.drawText(cx, h * 32 / 100, Graphics.FONT_XTINY, "SPI",
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
        dc.drawText(cx, h * 61 / 100, Graphics.FONT_XTINY, "hod:min:sek",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // Divider
        var divY = h * 69 / 100;
        dc.setColor(Palette.LINE, Graphics.COLOR_TRANSPARENT);
        dc.drawLine(w / 4, divY, w * 3 / 4, divY);

        // Wake-up counter
        dc.setColor(Palette.MUTED, Graphics.COLOR_TRANSPARENT);
        dc.drawText(cx, h * 77 / 100, Graphics.FONT_XTINY,
            "PREBUD. " + _wakeUps.toString() + "x",
            Graphics.TEXT_JUSTIFY_CENTER | Graphics.TEXT_JUSTIFY_VCENTER);

        // Button hints — the round bezel narrows sharply here, so pick the
        // longest variant that still fits the chord at this height.
        var hintY = h * 89 / 100;
        var hint = _fitText(dc, Graphics.FONT_XTINY, _usableWidth(w, h, hintY),
            ["DOWN +1   STOP koniec", "DOWN +1  STOP", "+1   STOP"] as Array<String>);
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
        var textW = dc.getTextWidthInPixels("HORE", Graphics.FONT_MEDIUM);
        var left = cx - (2 * sunR + gap + textW) / 2;

        _drawSun(dc, left + sunR, stateY, sunR);

        dc.setColor(Palette.STATE, Graphics.COLOR_TRANSPARENT);
        dc.drawText(left + 2 * sunR + gap, stateY, Graphics.FONT_MEDIUM, "HORE",
            Graphics.TEXT_JUSTIFY_LEFT | Graphics.TEXT_JUSTIFY_VCENTER);

        var hintY = h * 66 / 100;
        var hint = _fitText(dc, Graphics.FONT_XTINY, _usableWidth(w, h, hintY),
            ["START = zacat spanok", "START = spanok", "START"] as Array<String>);
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
