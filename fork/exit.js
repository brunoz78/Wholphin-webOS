/* Fork addition: asks before leaving the app. Back on the start page calls window.WholphinExit
   (build patch); the TV does not show window.confirm, so the original's question never appeared.
   Written for Chromium 79 (webOS 6). */
(function () {
  "use strict";
  var de = !window.wholphinI18n || window.wholphinI18n.lang !== "en";
  function t(en, german) {
    return de ? german : en;
  }

  window.WholphinExit = function () {
    if (document.getElementById("fork-exit")) return;
    var opener = document.activeElement,
      dialog = document.createElement("section");
    dialog.id = "fork-exit";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("data-no-i18n", "");
    var box = document.createElement("div");
    box.className = "fork-exit-box";
    var title = document.createElement("h2");
    title.textContent = t("Exit Wholphin?", "Wholphin beenden?");
    var buttons = document.createElement("div");
    buttons.className = "fork-exit-buttons";
    var quit = document.createElement("button"),
      cancel = document.createElement("button");
    quit.textContent = t("Exit", "Beenden");
    cancel.textContent = t("Cancel", "Abbrechen");
    buttons.appendChild(quit);
    buttons.appendChild(cancel);
    box.appendChild(title);
    box.appendChild(buttons);
    dialog.appendChild(box);
    document.body.appendChild(dialog);

    function close() {
      dialog.remove();
      if (opener && opener.isConnected) opener.focus();
    }
    quit.onclick = function () {
      window.close();
    };
    cancel.onclick = close;
    // The dialog keeps the keys: left/right between the buttons, Back cancels.
    dialog.addEventListener("keydown", function (event) {
      var key = event.keyCode;
      event.stopPropagation();
      if (key === 461 || key === 27 || key === 8) {
        event.preventDefault();
        close();
      } else if (key >= 37 && key <= 40) {
        event.preventDefault();
        (document.activeElement === quit ? cancel : quit).focus();
      }
    });
    cancel.focus();
  };
})();
