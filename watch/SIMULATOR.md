# Connect IQ simulator — runbook

How to bring up the simulator on this headless machine, load a `.prg` into it,
and drive it from another computer. Nothing here is SleepClick specific: the
same steps run any Connect IQ app (BaroBuddy included).

The machine has no display and no window manager, so the simulator runs on a
virtual X server and is reached over VNC.

---

## Quick start

```bash
# 1. virtual display (skip if already running)
pgrep -x Xvfb || Xvfb :99 -screen 0 1280x800x24 &

# 2. simulator
DISPLAY=:99 ~/opt/connectiq-sdk/bin/simulator &

# 3. remote access (skip if already running)
pgrep -x x11vnc || x11vnc -display :99 -localhost -nopw -forever -shared -quiet -bg

# 4. build and push an app
cd ~/projects/SleepClick/watch
make sim DEVICE=fr935
```

Then from your own machine:

```bash
ssh -N -L 5900:127.0.0.1:5900 developer@<host>
```

and point a VNC client at `localhost:5900`.

Check what is already up before starting anything:

```bash
ps -eo pid,etime,comm | grep -E 'Xvfb|simulator|x11vnc'
```

---

## What runs where

| Piece | Command | Notes |
|---|---|---|
| Virtual display | `Xvfb :99 -screen 0 1280x800x24` | Everything below needs `DISPLAY=:99` |
| Simulator | `~/opt/connectiq-sdk/bin/simulator` | `bin/connectiq` is a one-line wrapper for the same binary |
| Remote access | `x11vnc -display :99 -localhost -nopw -forever -shared -quiet -bg` | `-localhost` means loopback only — reachable solely through the SSH tunnel, which is why there is no password |
| App loader | `~/opt/connectiq-sdk/bin/monkeydo <file.prg> <device_id>` | Requires a running simulator |

---

## Loading an app

`make sim DEVICE=fr935` builds and pushes in one step. By hand:

```bash
DISPLAY=:99 ~/opt/connectiq-sdk/bin/monkeydo build/SleepClick-fr935.prg fr935
```

**monkeydo stays attached for as long as the app runs.** That is normal — it is
not hanging. Backgrounding it with a log is the practical form, because a crash
prints its Monkey C stack trace on this stream and nowhere else:

```bash
DISPLAY=:99 nohup ~/opt/connectiq-sdk/bin/monkeydo build/SleepClick-fr935.prg fr935 \
  > /tmp/sleepclick-sim.log 2>&1 &
tail -f /tmp/sleepclick-sim.log
```

`System.println()` output lands in the same log.

### Switching device

The device id is monkeydo's second argument and the simulator follows it — push
`…-fr230.prg fr230` and the window becomes an fr230. There is no menu to change
first. Valid ids come from the `<iq:products>` list in `manifest.xml`; only
devices whose bundle has been downloaded through the SDK Manager will work.

### One app at a time

Pushing a new `.prg` replaces whatever was running. Before taking the simulator
over, check whether someone else's app is in it:

```bash
pgrep -a monkeydo
```

---

## Driving it

### Screenshot without VNC

```bash
ffmpeg -loglevel error -f x11grab -video_size 1280x800 -i :99 \
  -frames:v 1 -update 1 /tmp/sim.png -y
```

### Clicking

**Keyboard input does not work.** There is no window manager, so the simulator
window never takes real focus and Qt discards synthetic key events —
`xdotool key` looks like it succeeds and nothing happens. Click the on-screen
buttons instead:

```bash
DISPLAY=:99 xdotool mousemove --sync 440 225 click 1   # START/STOP
DISPLAY=:99 xdotool mousemove --sync 98 390 click 1    # DOWN
```

Those two coordinates are measured on an fr935 at 1280×800 with the window in
its default position. The rest of the buttons (LIGHT, UP, BACK) sit at the
obvious spots on the bezel, but were not measured. **If the window has moved,
take a screenshot first and read the coordinates off it** — they are absolute
screen positions, not window-relative.

`xdotool windowactivate` fails with "windowmanager claims not to support
_NET_ACTIVE_WINDOW". That is expected and harmless; clicks work anyway.

---

## Gotchas

**monkeydo exit codes lie.** The underlying `shell` binary treats a dropped TCP
connection as success, so exit 0 can mean the simulator died. Exit 124 from a
`timeout` wrapper while the app is still on screen is the healthy case. Judge by
a screenshot and by `pgrep -x simulator`, never by the exit code.

**Core dumps fill the disk.** A simulator crash can write a multi-gigabyte dump
and take the filesystem to zero, which then breaks everything else on the
machine in confusing ways. Worth disabling while working here:

```bash
sudo systemctl mask systemd-coredump.socket
sudo systemctl disable --now apport.service
```

**The libsoup shim may or may not be needed.** If the simulator aborts with
`libsoup2 symbols detected`, both libsoup-2.4 and libsoup-3.0 have loaded and
each has detected the other. It is a distribution packaging conflict, not a
Garmin bug. `tools/soupfix.c` hides the two probed symbols:

```bash
gcc -shared -fPIC -o ~/opt/connectiq-sdk/soupfix.so tools/soupfix.c -ldl
LD_PRELOAD=~/opt/connectiq-sdk/soupfix.so DISPLAY=:99 \
  ~/opt/connectiq-sdk/bin/simulator &
```

A prebuilt copy is kept at `~/opt/connectiq-sdk/soupfix.so`. The same shim
applies to the SDK Manager. As of 2026-09-04 the simulator was running without
it, so try plain first.

**Device bundles are mandatory.** A device with no bundle under
`~/.Garmin/ConnectIQ/Devices/<id>/` makes the simulator crash on load rather
than report anything useful. Bundles come from the SDK Manager, which requires a
Garmin account login — there is no unauthenticated download. Never hand-write
`compiler.json` or `simulator.json`; that path was tried and wasted a day.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Invalid device id specified` | Device is not in `manifest.xml`, or its bundle was never downloaded |
| `monkeydo` returns instantly | Simulator is not running |
| Simulator exits on app load | Missing device bundle |
| `libsoup2 symbols detected` | Build and preload `tools/soupfix.c` |
| Clicks do nothing | Window moved — re-read coordinates from a fresh screenshot |
| Key presses do nothing | Expected; no window manager. Click instead |
| VNC refuses the connection | SSH tunnel is down, or x11vnc is not running |
