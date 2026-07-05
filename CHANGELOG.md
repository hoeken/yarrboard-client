# v1.5.0

_2026-07-05_

### Added

- `ping()` — sends a `ping` command (confirmed by default; pass `false` for a lightweight fire-and-forget heartbeat).
- `getFullConfig()` and `getShareableConfig()` — request the board's full and shareable configuration (`get_full_config` / `get_shareable_config`).
- `setTheme(theme)` — sets the app theme. Accepts only `'light'` or `'dark'`; throws a `RangeError` otherwise.

### Changed

- **`setBrightness()` now validates its argument.** It throws a `RangeError` unless the value is a finite number between 0 and 1 inclusive, rather than forwarding out-of-range values to the board.

### Removed

- The `getNetworkConfig()` and `getAppConfig()` helpers. Send the corresponding `cmd` (`get_network_config` / `get_app_config`) via `send()` directly if you still need them.

# v1.4.1

_2026-07-04_

### Changed

- **Lowered the minimum Node.js version from 22 to 20.11.0** (`engines.node` is `>=20.11.0`). The runtime uses nothing newer, and 20.11.0 is the first release with the `mock.timers` `{ apis }` option the test suite relies on.

# v1.4.0

_2026-07-04_

### Changed

- **Switched the WebSocket transport from the [`websocket`](https://www.npmjs.com/package/websocket) library to [`ws`](https://www.npmjs.com/package/ws).** `ws` is the de-facto standard, actively maintained, and dependency-free.
- **Now requires Node.js 22 or newer** (`engines.node` is `>=22`).
- Tests migrated from Mocha to Node's built-in test runner — run them with `npm test` (`node --test`); Mocha is no longer a dependency.

### Added

- A comprehensive unit-test suite covering connection handling, the message queue, throttling, timeouts, and reconnect logic, run in CI on Node 22 and 24.
- Automated, tag-driven releases: pushing a `vX.Y.Z` tag extracts the matching notes from this changelog, creates a GitHub Release, and publishes to npm with provenance via OIDC trusted publishing (see [RELEASE.md](RELEASE.md)).

### Removed

- The deprecated PWM/RGB/switch control methods `setPWMChannelState`, `setPWMChannelDuty`, `togglePWMChannel`, `fadePWMChannel`, `setRGB`, and `setSwitchState`. Send the corresponding `cmd` via `send()` directly instead.

### Fixed

- Several bugs surfaced while building the test suite, including closing a still-connecting socket throwing an uncaught `'error'` (a no-op error handler is now kept during `close()`).

# v1.3.0

_2025-03-27_

### Added

- Message queueing with a FIFO send loop, adaptive throttling in response to the board's `Queue Full` errors, and a client-side rate limit (~100 messages/second).
- An update poller (`startUpdatePoller(interval)`) that periodically issues `get_update` while connected.
- Connection state tracking exposed via `status()` — one of `IDLE`, `CONNECTING`, `CONNECTED`, `RETRYING`, or `FAILED`.
- Configurable per-message timeout with automatic resend and bail-out after repeated timeouts.
- `setBrightness()` helper.

### Fixed

- Reconnect logic no longer loops infinitely; retries now honor `maxConnectionRetries` (`-1` retries forever) and reset cleanly once a connection succeeds.

# v1.2.1

_2023-11-29_

### Changed

- Reworked message queueing, reconnect, and timeout handling for more reliable long-running connections.
- Packaging fixes for the published npm module.

# v1.2.0

_2023-11-18_

### Added

- OTA update handling and assorted client improvements.

# v1.1.0

_2023-10-31_

### Changed

- Updated the client to the current Yarrboard WebSocket protocol.

# v1.0.0

_2023-08-08_

Initial release of the Yarrboard client — a WebSocket client for connecting to and controlling a [Yarrboard](https://github.com/hoeken/yarrboard).
