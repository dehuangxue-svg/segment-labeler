const test = require("node:test");
const assert = require("node:assert/strict");

require("../src/locales/en");
require("../src/locales/zh-CN");
require("../src/locales/zh-TW");
require("../src/locales/ja");
require("../src/locales/ko");
require("../src/locales/es");
require("../src/i18n");

test("normalizes supported and regional locales", () => {
  assert.equal(SegmentLabelerI18n.normalizeLocale("zh-HK"), "zh-TW");
  assert.equal(SegmentLabelerI18n.normalizeLocale("zh_CN"), "zh-CN");
  assert.equal(SegmentLabelerI18n.normalizeLocale("es-MX"), "es");
  assert.equal(SegmentLabelerI18n.normalizeLocale("fr-FR"), "en");
});

test("every bundled locale contains every English source key", () => {
  const sourceKeys = Object.keys(SegmentLabelerLocales.en).sort();
  for (const locale of SegmentLabelerI18n.supported) {
    assert.deepEqual(Object.keys(SegmentLabelerLocales[locale]).sort(), sourceKeys, locale);
  }
});

test("interpolates translated values", () => {
  const i18n = SegmentLabelerI18n.create(SegmentLabelerLocales, "zh-CN");
  assert.equal(i18n.text("format.cuts", { count: 3 }), "3 个切点");
  i18n.setLocale("en-US");
  assert.equal(i18n.text("format.cuts", { count: 3 }), "3 cuts");
});

