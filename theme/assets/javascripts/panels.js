/* Keyboard access for the pinned modern theme's native navigation toggles. */
(() => {
  const drawerMedia = matchMedia("(max-width: 76.234375em)");
  const tocMedia = matchMedia("(max-width: 59.984375em)");
  let panels = [];

  // Embedded shadow components own their events, including native search.
  function inForeignComponent(event) {
    return event.composedPath().some(node =>
      node instanceof ShadowRoot ||
      (node instanceof Element && node.matches('[data-md-component="search"]'))
    );
  }

  function scrollContainer(panel, link) {
    for (let node = link?.parentElement; node && panel.sidebar.contains(node); node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(node).overflowY)) return node;
    }
    return null;
  }

  function revealCurrent(panel) {
    const link = panel.content.querySelector('[aria-current="location"]') ||
      panel.content.querySelector(".md-nav__link--active");
    const scroller = scrollContainer(panel, link);
    if (scroller) {
      const bounds = scroller.getBoundingClientRect();
      const style = getComputedStyle(scroller);
      const top = bounds.top + (parseFloat(style.paddingTop) || 0);
      const bottom = bounds.bottom - (parseFloat(style.paddingBottom) || 0);
      const target = link.getBoundingClientRect();
      if (target.top < top) scroller.scrollTop += target.top - top;
      else if (target.bottom > bottom) scroller.scrollTop += target.bottom - bottom;
    }
    panel.content.toggleAttribute("data-strio-scrollable", Boolean(scroller));
    return link;
  }

  function sync(panel) {
    const compact = panel.media.matches;
    panel.open = compact && panel.toggle.checked;
    panel.content.inert = compact && !panel.open;
    panel.trigger.tabIndex = compact ? 0 : -1;
    panel.trigger.setAttribute("aria-expanded", String(panel.open));
    panel.close.hidden = !compact;
    if (panel.open) requestAnimationFrame(() => revealCurrent(panel));
  }

  function setOpen(panel, open, { keyboard = false, restore = false } = {}) {
    if (!panel.media.matches) return;
    if (open) {
      panels.filter(other => other !== panel).forEach(other => setOpen(other, false));
    }
    panel.toggle.checked = open;
    sync(panel);
    panel.toggle.dispatchEvent(new Event("input", { bubbles: true }));
    panel.toggle.dispatchEvent(new Event("change", { bubbles: true }));
    sync(panel);
    if (open && keyboard) {
      const target = panel.kind === "toc" ? revealCurrent(panel) : null;
      (target || panel.close).focus({ preventScroll: true });
    } else if (!open && restore) {
      panel.trigger.focus({ preventScroll: true });
    }
  }

  function mount() {
    panels = [];
    for (const [kind, selector, triggerSelector, media, label] of [
      ["drawer", ".md-sidebar--primary", '.md-header__button[for="__drawer"]', drawerMedia, "navigation"],
      ["toc", ".md-sidebar--secondary", '.md-sidebar--secondary .md-sidebar-button[for="__toc"]', tocMedia, "contents"],
    ]) {
      const sidebar = document.querySelector(selector);
      const trigger = document.querySelector(triggerSelector);
      const toggle = document.getElementById(`__${kind}`);
      if (!sidebar || !trigger || !toggle) continue;
      const content = kind === "drawer" ? sidebar : sidebar.querySelector(".md-sidebar__inner");
      if (!content) continue;
      content.id = `strio-${kind}-panel`;
      trigger.setAttribute("role", "button");
      trigger.setAttribute("aria-label", `Toggle ${label}`);
      trigger.setAttribute("aria-controls", content.id);
      trigger.dataset.strioPanelTrigger = kind;
      let close = content.querySelector(".strio-panel-close");
      if (!close) {
        close = document.createElement("button");
        close.type = "button";
        close.className = "strio-panel-close";
        close.textContent = "Close";
        content.prepend(close);
      }
      close.setAttribute("aria-label", `Close ${label}`);
      close.title = `Close ${label}`;
      close.dataset.strioPanelClose = kind;
      const panel = { kind, sidebar, content, trigger, toggle, close, media, open: false };
      panels.push(panel);
      sync(panel);
    }
  }

  document.addEventListener("keydown", event => {
    if (inForeignComponent(event) || event.defaultPrevented) return;
    const trigger = event.target instanceof Element ? event.target.closest("[data-strio-panel-trigger]") : null;
    const panel = panels.find(item => item.trigger === trigger);
    if (panel && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(panel, !panel.open, { keyboard: true, restore: panel.open });
    } else if (event.key === "Escape") {
      const open = panels.find(item => item.open);
      if (open) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(open, false, { restore: true });
      }
    }
  }, true);

  document.addEventListener("click", event => {
    if (inForeignComponent(event) || !(event.target instanceof Element)) return;
    const trigger = event.target.closest("[data-strio-panel-trigger]");
    const close = event.target.closest("[data-strio-panel-close]");
    const panel = panels.find(item => item.trigger === trigger || item.close === close);
    if (panel?.media.matches) {
      event.preventDefault();
      setOpen(panel, close ? false : !panel.open, { restore: Boolean(close) });
      return;
    }
    // Native labels still handle pointer toggles. Close other outside clicks;
    // panel links retain their navigation and focus behavior.
    for (const item of panels.filter(item => item.open)) {
      const label = event.target.closest(`label[for="__${item.kind}"]`);
      if (label) continue;
      if (!item.content.contains(event.target)) setOpen(item, false, { restore: true });
      else if (event.target.closest("a[href]")) setOpen(item, false);
    }
  }, true);

  document.addEventListener("change", event => {
    const panel = panels.find(item => item.toggle === event.target);
    if (!panel) return;
    const wasOpen = panel.open;
    sync(panel);
    if (wasOpen && !panel.open && panel.media.matches && panel.content.contains(document.activeElement)) {
      panel.trigger.focus({ preventScroll: true });
    }
  });

  function resize() {
    for (const panel of panels) {
      const focusedInside = panel.content.contains(document.activeElement);
      if (!panel.media.matches && panel.toggle.checked) {
        panel.toggle.checked = false;
        panel.toggle.dispatchEvent(new Event("change", { bubbles: true }));
      }
      sync(panel);
      if (panel.media.matches && !panel.open && focusedInside) {
        panel.trigger.focus({ preventScroll: true });
      }
    }
  }
  drawerMedia.addEventListener("change", resize);
  tocMedia.addEventListener("change", resize);
  document$.subscribe(mount);
})();
