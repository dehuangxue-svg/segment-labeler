(function initI18n(root) {
  const supported = ["en", "zh-CN", "zh-TW", "ja", "ko", "es"];

  function normalizeLocale(value) {
    const locale = String(value || "").replace("_", "-").toLowerCase();
    if (locale.startsWith("zh-tw") || locale.startsWith("zh-hk") || locale.startsWith("zh-mo")) return "zh-TW";
    if (locale.startsWith("zh")) return "zh-CN";
    const direct = supported.find((item) => item.toLowerCase() === locale);
    if (direct) return direct;
    const language = supported.find((item) => item.toLowerCase().split("-")[0] === locale.split("-")[0]);
    return language || "en";
  }

  function interpolate(template, values = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_match, key) => values[key] ?? `{${key}}`);
  }

  function create(locales, initialLocale) {
    let locale = normalizeLocale(initialLocale);
    const text = (key, values) => {
      const template = locales[locale]?.[key] ?? locales.en?.[key] ?? key;
      return interpolate(template, values);
    };
    return {
      get locale() { return locale; },
      setLocale(value) { locale = normalizeLocale(value); return locale; },
      text,
      apply(rootElement = document) {
        rootElement.querySelectorAll("[data-i18n]").forEach((element) => {
          element.textContent = text(element.dataset.i18n);
        });
        rootElement.querySelectorAll("[data-i18n-title]").forEach((element) => {
          element.title = text(element.dataset.i18nTitle);
        });
        rootElement.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
          element.placeholder = text(element.dataset.i18nPlaceholder);
        });
        rootElement.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
          element.setAttribute("aria-label", text(element.dataset.i18nAriaLabel));
        });
        document.documentElement.lang = locale;
        document.title = text("app.name");
      },
    };
  }

  root.SegmentLabelerI18n = { supported, normalizeLocale, create };
})(globalThis);
