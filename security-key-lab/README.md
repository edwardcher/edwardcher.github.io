# Security-Key-First WebAuthn Lab — v2

Standalone WebAuthn experiment, deployed at `/security-key-lab/` on `https://edwardcher.online` via Zola static assets.

## Real capabilities
- Real `navigator.credentials.create()` and `get()` ceremonies, with external security-key preference (`hints: ["security-key"]`, `authenticatorAttachment: "cross-platform"`).
- Register a FIDO2 security key or FIDO2-enabled smart card using an appropriate reader and browser/OS transport.
- Authenticate using a selected credential or `allowCredentials: []` for discoverable credential selection.
- Browser-side cryptographic verification of ES256/RS256 assertion signatures with Web Crypto, plus challenge, origin, RP hash, UP/UV and counter checks.
- Local-only credential registry, progress indicator and browser capabilities.
- Safari-first UI; Chrome-compatible WebAuthn API usage. Browsers own their prompts and may ignore hints.

## Security limitations
This is **not a trusted RP**: challenge and public key storage are in the same browser origin, and registration attestation/trust chains are not verified. No server-side sessions, anti-replay guarantee across devices, authenticator policy enforcement, or secure account recovery. Never use it for production login or real account protection. Local browser data may be edited. The same physical key can be used in Safari and Chrome, but the browser-local registry must be independently established; local registrations are RP ID-bound.

## Running
Deploy entire Zola site with `static/security-key-lab/`. Open `https://edwardcher.online/security-key-lab/` directly in Safari or Chrome. Do not use `file://`. Local development on `http://localhost` is allowed but uses a different RP ID, so credentials won't transfer to the public domain.

A FIDO2 smart card requires the FIDO2 application and an appropriate reader/transport; a PIV-only card is not a WebAuthn authenticator.

## Testing
Test physical-key registration and authentication, PIN required and preferred, discoverable credentials, duplicate registration, Safari and Chrome. No physical hardware test was performed in the authoring environment.
