(function () {
    var slot = document.getElementById("contactSlot");
    if (!slot) return;

    var user = "contact";
    var host = "herownterms" + ".me";
    var email = user + "@" + host;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "mail-button";
    button.textContent = user + " @ " + host;
    button.addEventListener("click", function () {
        window.location.href = "mail" + "to:" + email;
    });
    slot.replaceChildren(button);
})();
