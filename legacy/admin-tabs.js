(() => {
  const tabs = [...document.querySelectorAll(".admin-tab")];
  const buttons = [...document.querySelectorAll(".admin-tab-btn")];
  if (!tabs.length) return;

  const ids = tabs.map((tab) => tab.id);
  const defaultTab = ids[0];

  function show(id) {
    const target = ids.includes(id) ? id : defaultTab;
    tabs.forEach((tab) => {
      tab.hidden = tab.id !== target;
    });
    buttons.forEach((btn) => {
      const active = btn.dataset.tab === target;
      btn.classList.toggle("is-active", active);
      if (active) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    return target;
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      const target = show(btn.dataset.tab);
      history.replaceState(null, "", `#${target}`);
      window.scrollTo({ top: 0 });
    });
  });

  window.addEventListener("hashchange", () => show(location.hash.slice(1)));

  show(location.hash.slice(1));
})();
