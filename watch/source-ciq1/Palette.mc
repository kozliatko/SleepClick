import Toybox.Lang;

//! Colours for 4 bpp devices (the fr230 has just 14 entries). There is no teal
//! in that palette — it quantises onto the same blue as the clock — so the
//! awake state uses green here instead. Values are exact palette entries.
//! The Connect IQ 2.4+ build swaps in source-ciq3/Palette.mc — keep the names
//! in sync between the two.
module Palette {
    //! Current time of day
    const CLOCK = 0x00AAFF;
    //! "HORE" — green, the only hue left that reads as distinct from the
    //! blue clock
    const STATE = 0x00FF00;
    //! Running sleep counter
    const TIMER = 0xFFAA00;
    //! Sun icon on the awake screen
    const SUN = 0xFFAA00;
    //! Moon icon beside the timer
    const MOON = 0xAAAAAA;
    //! Wake-up counter
    const MUTED = 0xAAAAAA;
    //! Labels and button hints
    const DIM = 0x555555;
    //! Divider rule — no darker blue exists here
    const LINE = 0x555555;
}
