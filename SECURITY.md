# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| latest  | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in this project, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email: **paul@pmds.info**

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 1 week
- **Fix or mitigation:** As soon as reasonably possible

## Security Best Practices for Users

Vespasian operates on your live Wix account through two credentials — an account-level API key and a persisted browser session. Both are secrets:

1. **Never commit `.env`** — it holds `WIX_API_KEY` and your account/site IDs. The `.gitignore` excludes `.env` and `.env.*` by default (only `.env.example`, which contains placeholders, is tracked). Always double-check before committing.
2. **Never commit `.vespasian/`** — `.vespasian/session/state.json` is a persisted, logged-in Wix editor session (Playwright `storageState`). Anyone holding that file can act as you in the Wix editor. The whole `.vespasian/` state directory is gitignored; keep it that way, and `chmod 600` the session file.
3. **API keys are account-scoped** — a Wix API key grants access to your *entire* Wix account, not just one site. Create it with only the permission sets Vespasian needs, rotate it if it may have leaked, and revoke it at [manage.wix.com/account/api-keys](https://manage.wix.com/account/api-keys) when no longer needed.
4. **Use a dedicated Wix login for editor automation** — a Wix-native email+password account (not Google SSO) used only for `vespasian login --editor` limits blast radius.
5. **Prefer a keychain/secret manager over `.env` for `WIX_EDITOR_TOTP_SECRET`** (reserved — TOTP re-auth is not implemented in v0.1) — a TOTP seed on disk defeats the purpose of 2FA if the machine is compromised.

## Scope

This security policy applies to the Vespasian repository itself — its CLI, pipelines, scripts, and GUI. Vulnerabilities in the Wix platform or in third-party Wix apps should be reported to Wix (or the respective app vendor) through their own responsible-disclosure channels.
