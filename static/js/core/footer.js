/* Shared PMAID footer */
(function () {
  var footer = document.createElement("footer");
  footer.className = "app-footer";
  footer.innerHTML =
    "<div class='app-footer-inner'>" +
      "<p class='app-footer-copy'>&copy; Shuvro Basu, 2026. All Rights Reserved.</p>" +
      "<nav class='app-footer-links' aria-label='Shuvro Basu links'>" +
        "<a href='https://www.linkedin.com/in/shuvrobasu' target='_blank' rel='noopener noreferrer' aria-label='Shuvro Basu on LinkedIn'>" +
          "<svg viewBox='0 0 24 24' width='18' height='18' style='display:block;width:18px;height:18px;min-width:18px;max-width:18px' aria-hidden='true'><path d='M6.5 8.4H3.3V19h3.2V8.4ZM4.9 3a1.9 1.9 0 1 0 0 3.8A1.9 1.9 0 0 0 4.9 3ZM20.7 13c0-3.2-1.7-4.9-4.1-4.9-1.9 0-2.8 1.1-3.3 1.8V8.4h-3.2V19h3.2v-5.2c0-1.4.3-2.8 2.1-2.8 1.8 0 1.9 1.7 1.9 2.9V19h3.2l.2-6Z'/></svg>" +
          "<span>LinkedIn</span>" +
        "</a>" +
        "<a href='https://github.com/shuvrobasu?tab=repositories' target='_blank' rel='noopener noreferrer' aria-label='Shuvro Basu on GitHub'>" +
          "<svg viewBox='0 0 24 24' width='18' height='18' style='display:block;width:18px;height:18px;min-width:18px;max-width:18px' aria-hidden='true'><path d='M12 2.5a9.7 9.7 0 0 0-3.1 18.9c.5.1.7-.2.7-.5v-1.9c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 0 1.6 1.1 1.6 1.1.9 1.6 2.4 1.1 2.9.8.1-.7.4-1.1.7-1.3-2.3-.3-4.7-1.2-4.7-5a4 4 0 0 1 1-2.7c-.1-.3-.4-1.3.1-2.7 0 0 .9-.3 2.8 1a9.4 9.4 0 0 1 5.1 0c2-1.3 2.8-1 2.8-1 .6 1.4.2 2.4.1 2.7a4 4 0 0 1 1 2.7c0 3.8-2.4 4.7-4.7 5 .4.3.7 1 .7 2v3c0 .3.2.6.7.5A9.7 9.7 0 0 0 12 2.5Z'/></svg>" +
          "<span>GitHub</span>" +
        "</a>" +
        "<a href='https://www.shuvrobasu.info' target='_blank' rel='noopener noreferrer' aria-label='Shuvro Basu website'>" +
          "<svg viewBox='0 0 24 24' width='18' height='18' style='display:block;width:18px;height:18px;min-width:18px;max-width:18px' aria-hidden='true'><circle cx='12' cy='12' r='9'/><path d='M3 12h18M12 3c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21c-2.2-2.5-3.3-5.5-3.3-9S9.8 5.5 12 3Z'/></svg>" +
          "<span>Website</span>" +
        "</a>" +
      "</nav>" +
    "</div>";
  var splash = document.getElementById("splash");
  if (splash !== null) {
    footer.className = "app-footer app-footer--splash";
  }
  document.body.classList.add("has-app-footer");
  document.body.appendChild(footer);
})();
