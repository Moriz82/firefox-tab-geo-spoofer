# Tab Geo Spoofer (Firefox)

Spoof geolocation for only the active tab using:

- Manual coordinates
- Clickable map picker
- Saved presets
- One-click reset back to real device location

## Install (Temporary Add-on)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on...**
3. Select `manifest.json` from this folder

## Publish to AMO

1. Create an AMO developer account: https://addons.mozilla.org/developers/
2. In AMO, create API credentials (JWT issuer + secret).
3. Install `web-ext`:
   - `npm install -g web-ext`
4. Build/sign from this folder:
   - `web-ext sign --channel=listed --api-key="$AMO_JWT_ISSUER" --api-secret="$AMO_JWT_SECRET"`
5. Complete listing metadata in AMO (summary, screenshots, categories, support URL, privacy policy URL).

Use `PRIVACY_POLICY.md` as the basis for your hosted privacy policy page.

## How It Works

- The extension keeps spoofed coordinates scoped to one tab ID.
- Other tabs keep using real geolocation.
- `Reset to Real Location` clears spoofing for that tab immediately.

## Usage

1. Open the page you want to spoof.
2. Click the extension icon.
3. Set latitude/longitude manually or click the map.
4. Click **Apply to Current Tab**.
5. Optional: save presets and apply/delete later.
