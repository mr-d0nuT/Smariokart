# Contributing

Thank you for helping improve Super Mario Kart JS.

## Before opening a change

- Keep the project runnable without a build step and without network access.
- Do not add ROMs, extracted commercial game data, save states, credentials, or proprietary SDK files.
- Clearly identify the source and license of every new asset or substantial code port.
- Preserve the upstream acknowledgements in `README.md` and `THIRD_PARTY_NOTICES.md`.
- Keep gameplay changes scoped and add a regression test when practical.

## Test locally

Run the complete test suite before opening a pull request:

```bash
node test.js
node render_test.js
node strict_test.js
node acceptance_check.js
```

For visual changes, also play at least one Grand Prix race and one Balloon Battle course in a browser.

## Reporting bugs

Please include:

- Browser and operating system
- Whether the game was opened through `file://` or a local HTTP server
- Course and game mode
- Exact reproduction steps
- The complete on-screen or console error, if present

By contributing, you agree that your contribution may be distributed under GPL-3.0.

