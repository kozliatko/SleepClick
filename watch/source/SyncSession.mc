import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;

//! One upload of pending sleep sessions to the backend.
//! This is a class rather than plain module functions because makeWebRequest
//! needs a bound method() as its callback, and a module cannot provide one.
class SyncSession {

    //! True while a request is waiting for its response
    private var _inFlight as Boolean = false;

    //! Constructor
    public function initialize() {
    }

    //! Whether a request is still outstanding.
    //! @return true while a response is pending
    public function isBusy() as Boolean {
        return _inFlight;
    }

    //! Post a batch of sessions to the backend. Nothing is marked synced
    //! until the server confirms it, so a failure here costs only a retry.
    //! @param url Endpoint from app settings
    //! @param token Bearer token from app settings
    //! @param batch Sessions to upload
    public function send(url as String, token as String, batch as Array) as Void {
        _inFlight = true;
        try {
            Communications.makeWebRequest(
                url,
                { "sessions" => batch },
                {
                    :method => Communications.HTTP_REQUEST_METHOD_POST,
                    :headers => {
                        "Content-Type" => Communications.REQUEST_CONTENT_TYPE_JSON,
                        "Authorization" => "Bearer " + token
                    },
                    :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
                },
                method(:onResponse)
            );
        } catch (ex) {
            // makeWebRequest throws InvalidOptionsException, and
            // SymbolNotAllowedException on devices that do not support the
            // requested response type. Neither is worth ending the app over:
            // the sessions stay unsynced and the next attempt retries.
            _inFlight = false;
            System.println("SyncSession: request not sent: " + ex.getErrorMessage());
        }
    }

    //! Handle the backend's reply.
    //! @param code HTTP status, or a negative Communications error code
    //! @param data Decoded JSON body, or null when the request failed
    public function onResponse(code as Number, data as Dictionary?) as Void {
        _inFlight = false;

        if (code != 200 || data == null) {
            // Leave everything unsynced; the next attempt retries.
            return;
        }

        // Mark only what the server actually took.
        var accepted = data["accepted"];
        if (accepted instanceof Array) {
            SessionStorage.markSynced(accepted as Array);
        }
        // Ids the server judged invalid are marked too — retrying them forever
        // would block every later session behind a permanently bad record.
        var rejected = data["rejected"];
        if (rejected instanceof Array) {
            SessionStorage.markSynced(rejected as Array);
        }
    }
}
