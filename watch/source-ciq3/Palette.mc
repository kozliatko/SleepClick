import Toybox.Lang;

// Colours for 8 bpp devices (fr935: 64-colour cube of 00/55/AA/FF).
// Every value below is an exact palette entry, so nothing dithers.
// The CIQ 1.x build swaps in source-ciq1/Palette.mc — keep the keys in sync.
module Palette {
    const CLOCK = 0x55AAFF;  // current time
    const STATE = 0x00FFAA;  // "HORE" — teal, clearly apart from the clock
    const TIMER = 0xFFAA00;  // running sleep counter
    const SUN   = 0xFFAA00;
    const MOON  = 0xAAAAAA;
    const MUTED = 0xAAAAAA;  // wake-up counter
    const DIM   = 0x555555;  // labels, button hints
    const LINE  = 0x000055;  // divider
}
