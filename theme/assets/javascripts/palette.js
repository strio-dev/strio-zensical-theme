(() => {
  // Native palette code turns the translucent header's RGBA alpha into invalid
  // hex digits. Keep its palette behavior, but use the opaque page surface for tint.
  document.head.querySelectorAll('meta[name="theme-color"]:not([media])').forEach(meta => {
    meta.media = "not all";
  });
  const themeColor = document.createElement("meta");
  themeColor.name = "theme-color";
  document.head.append(themeColor);

  const sync = () => {
    const rgb = getComputedStyle(document.body).backgroundColor.match(
      /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:\s*[,/]\s*1(?:\.0+)?)?\s*\)$/
    );
    if (rgb) {
      themeColor.content = `#${rgb.slice(1, 4).map(channel => Number(channel).toString(16).padStart(2, "0")).join("")}`;
    }
  };
  sync();
  // Native input listeners update the body before this bubbling change handler.
  document.querySelector('[data-md-component="palette"]')?.addEventListener("change", sync);
  // Let all native media-query listeners apply the new scheme before reading it.
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => requestAnimationFrame(sync));
  if (typeof document$ !== "undefined") document$.subscribe(sync);
})();
