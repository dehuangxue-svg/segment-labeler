# Contributing

## Development

```bash
npm ci
npm test
npm start
```

FFmpeg and FFprobe must be available on `PATH`.

## Translations

English is the source locale in `src/locales/en.js`. To add a language:

1. Copy `src/locales/en.js` to `src/locales/<locale>.js`.
2. Keep every message key unchanged and translate only the values.
3. Register the locale in `src/index.html`, `src/main.js`, and `src/i18n.js`.
4. Add the language to the selector in `src/index.html`.
5. Run `npm test` to verify locale completeness.

Use a BCP 47 language tag such as `fr`, `de`, or `pt-BR`.

## Pull requests

Keep changes scoped, add tests for behavior changes, and verify the app at its minimum window size before submitting.

