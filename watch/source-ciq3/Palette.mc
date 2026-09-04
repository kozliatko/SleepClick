import Toybox.Lang;

//! Colours for 8 bpp devices (fr935: 64-colour cube of 00/55/AA/FF).
//! Every value below is an exact palette entry, so nothing dithers.
//! The Connect IQ 1.x build swaps in source-ciq1/Palette.mc — keep the names
//! in sync between the two.
module Palette {
    //! Current time of day
    const CLOCK = 0x55AAFF;
    //! "HORE" — teal, clearly apart from the clock
    const STATE = 0x00FFAA;
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
    //! Divider rule
    const LINE = 0x000055;
}
