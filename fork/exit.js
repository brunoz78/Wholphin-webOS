/* Fork addition: asks before leaving the app. Back on the start page calls window.WholphinExit
   (build patch); the TV does not show window.confirm, so the original's question never appeared.
   Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
  var de = !window.wholphinI18n || window.wholphinI18n.lang !== "en";
  function t(en, german) {
    return de ? german : en;
  }
  var open = false;

  // `leave` closes the app on platforms with their own exit (Fire TV); webOS closes the window.
  window.WholphinExit = function (leave) {
    if (open || !window.WholphinDialog) return;
    open = true;
    window.WholphinDialog({
      title: t("Exit Wholphin?", "Wholphin beenden?"),
      buttons: [
        {
          label: t("Exit", "Beenden"),
          action: function () {
            if (leave) leave();
            else window.close();
          },
        },
        { label: t("Cancel", "Abbrechen") },
      ],
      focus: 1, // Cancel: an extra Back must not leave the app
      onClose: function () {
        open = false;
      },
    });
  };
})();
