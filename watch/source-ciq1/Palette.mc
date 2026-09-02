import Toybox.Lang;

// Colours for 4 bpp devices (fr230 has just 14 entries). There is no teal in
// that palette — it quantises onto the same blue as the clock — so the awake
// state uses green here instead. Values are exact palette entries.
module Palette {
    const CLOCK = 0x00AAFF;  // current time
    const STATE = 0x00FF00;  // "HORE" — green, the only hue left that reads
                             // as distinct from the blue clock
    const TIMER = 0xFFAA00;  // running sleep counter
    const SUN   = 0xFFAA00;
    const MOON  = 0xAAAAAA;
    const MUTED = 0xAAAAAA;  // wake-up counter
    const DIM   = 0x555555;  // labels, button hints
    const LINE  = 0x555555;  // divider — no darker blue exists here
}
