// libsoup2/libsoup3 conflict shim for the Connect IQ simulator.
//
// The simulator and the SDK Manager pull in both libsoup-2.4 and libsoup-3.0
// through their plugin stack. Each version probes for a symbol that only the
// other defines, concludes the wrong library is loaded, and aborts with
// "libsoup2 symbols detected". Neither is a Garmin bug — it is a distribution
// packaging conflict.
//
// This override hides the two probed symbols so each library sees only itself.
// Everything else falls through to the real g_module_symbol.
//
// Build and use:
//   gcc -shared -fPIC -o soupfix.so tools/soupfix.c -ldl
//   LD_PRELOAD=$PWD/soupfix.so DISPLAY=:99 ~/opt/connectiq-sdk/bin/simulator &

#define _GNU_SOURCE
#include <dlfcn.h>
#include <string.h>

typedef int gboolean;
typedef void *gpointer;
typedef void GModule;

gboolean g_module_symbol(GModule *m, const char *name, gpointer *sym) {
    if (name && (strcmp(name, "soup_uri_new") == 0 ||
                 strcmp(name, "soup_date_time_new_from_http_string") == 0)) {
        if (sym) { *sym = NULL; }
        return 0;
    }
    static gboolean (*real)(GModule *, const char *, gpointer *) = NULL;
    if (!real) { real = dlsym(RTLD_NEXT, "g_module_symbol"); }
    return real(m, name, sym);
}
