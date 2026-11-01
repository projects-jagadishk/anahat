# ANAHAT // DISTRIBUTION & RELEASE GUIDE

**Version:** 1.0.0  
**Target Platform:** Tauri v2 Native Desktop (macOS, Windows, Linux) + Static Web

---

## 1. Overview & Artifact Matrix

Anahat packages as a lightweight (< 25 MB) self-contained desktop binary containing the native Rust core, Web Audio DSP engine, and GPU-accelerated WebGL cymatic visualizers.

| Platform                  | Architecture               | Bundle Format         | Output Path                                                 |
| :------------------------ | :------------------------- | :-------------------- | :---------------------------------------------------------- |
| **macOS (Apple Silicon)** | `aarch64-apple-darwin`     | `.dmg`, `.app`        | `src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/` |
| **macOS (Intel)**         | `x86_64-apple-darwin`      | `.dmg`, `.app`        | `src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/`  |
| **Windows**               | `x86_64-pc-windows-msvc`   | `.msi`, `.exe` (NSIS) | `src-tauri/target/release/bundle/nsis/`, `bundle/msi/`      |
| **Linux**                 | `x86_64-unknown-linux-gnu` | `.AppImage`, `.deb`   | `src-tauri/target/release/bundle/appimage/`, `bundle/deb/`  |

---

## 2. Local Build & Packaging

### 2.1 Standard Build

To build the distribution installer for your current host operating system:

```bash
# 1. Ensure node dependencies and build artifacts are fresh
npm install
npm run build

# 2. Package release bundle via Tauri CLI
npm run tauri:build
```

### 2.2 macOS Universal & Architecture-Specific Builds

To build optimized binaries for Apple Silicon (M1/M2/M3/M4) or Intel:

```bash
# Apple Silicon (M-series)
npm run tauri:build -- --target aarch64-apple-darwin

# Intel x86_64
npm run tauri:build -- --target x86_64-apple-darwin

# Universal Binary (combines both architectures via lipo)
npm run tauri:build -- --target universal-apple-darwin
```

---

## 3. Code Signing & Notarization

Unsigned desktop binaries trigger OS warnings (e.g., macOS Gatekeeper _"Anahat is damaged and cannot be opened"_ or Windows _"Microsoft Defender SmartScreen prevented an unrecognized app from starting"_).

### 3.1 macOS Code Signing & Apple Notarization

1. **Enroll in Apple Developer Program:** Obtain a `Developer ID Application` certificate from [developer.apple.com](https://developer.apple.com).
2. **Install Certificate:** Import the `.p12` certificate into your macOS Keychain.
3. **Configure Environment Variables:**
   ```bash
   export APPLE_CERTIFICATE="<Base64-encoded .p12 certificate>"
   export APPLE_CERTIFICATE_PASSWORD="<certificate password>"
   export APPLE_ID="your-apple-id@email.com"
   export APPLE_PASSWORD="app-specific-apple-id-password"
   export APPLE_TEAM_ID="YOUR_10_DIGIT_TEAM_ID"
   ```
4. **Automated Notarization via Tauri:** When these variables are set, `npm run tauri:build` signs the `.app` bundle, wraps it in the `.dmg`, submits it to Apple's `notarytool` service, and staples the notarization ticket automatically.

### 3.2 Windows EV Code Signing

1. **Obtain Code Signing Certificate:** Acquire an EV (Extended Validation) code signing certificate or use Azure Trusted Signing.
2. **Configure Tauri `tauri.conf.json`:**
   ```json
   "bundle": {
     "windows": {
       "certificateThumbprint": "YOUR_CERTIFICATE_THUMBPRINT",
       "digestAlgorithm": "sha256",
       "timestampUrl": "http://timestamp.digicert.com"
     }
   }
   ```
3. Alternatively, sign post-build with `signtool.exe`:
   ```powershell
   signtool sign /tr http://timestamp.digicert.com /td sha256 /fd sha256 /a "src-tauri\target\release\bundle\nsis\Anahat_1.0.0_x64-setup.exe"
   ```

---

## 4. Automated CI/CD Release Pipeline (GitHub Actions)

Create `.github/workflows/release.yml` to automatically build, package, sign, and release Anahat across macOS, Windows, and Linux whenever a version tag is pushed:

```yaml
name: Release Anahat

on:
  push:
    tags:
      - "v*"

jobs:
  release:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: "macos-latest"
            args: "--target universal-apple-darwin"
          - platform: "ubuntu-22.04"
            args: ""
          - platform: "windows-latest"
            args: ""

    runs-on: ${{ matrix.platform }}
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: "npm"

      - name: Install Rust toolchain
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform == 'macos-latest' && 'aarch64-apple-darwin,x86_64-apple-darwin' || '' }}

      - name: Install Linux dependencies (Ubuntu only)
        if: matrix.platform == 'ubuntu-22.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libgtk-3-dev

      - name: Install dependencies & Build Frontend
        run: |
          npm ci
          npm run build

      - name: Build Tauri Desktop Bundle
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "Anahat ${{ github.ref_name }}"
          releaseBody: "See changelog for release details."
          releaseDraft: false
          prerelease: false
          args: ${{ matrix.args }}
```

---

## 5. Distribution Channels

### 5.1 Static Download Website (`website/`)

The included `website/` directory is fully configured for deployment on Cloudflare Pages under the custom domain **`anahat.jagadishk.work`**:

- **Pre-configured Files in `website/`:**
  - `robots.txt`: Disallows AI scrapers, LLM agents, and training harvesters (`GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`, etc.) while allowing search engine discovery (Google, Bing, DuckDuckGo).
  - `_headers`: Cloudflare Pages response headers including `X-Robots-Tag: noai, noimageai` and security policies.
  - `sitemap.xml`: Canonical sitemap pointing to `https://anahat.jagadishk.work/`.
  - `index.html`: Fully self-contained brutalist landing page with client OS detection and interactive in-browser Chladni simulator.

- **Deployment Methods:**
  - **Option A — Cloudflare Pages Git Integration (Recommended):**
    1. In the Cloudflare Dashboard, navigate to **Compute (Workers) > Workers & Pages > Create application > Pages > Connect to Git**.
    2. Select the `anahat` repository.
    3. Build Configuration:
       - Framework preset: `None`
       - Build output directory: `website`
       - Build command: *(leave empty)*
    4. Custom Domain:
       - Go to the **Custom domains** tab in your Pages project.
       - Add `anahat.jagadishk.work`.
       - Cloudflare automatically routes the CNAME and issues an edge SSL certificate.
  - **Option B — Direct Deployment via Wrangler CLI:**
    ```bash
    npx wrangler pages deploy website --project-name anahat
    ```
- Point the download buttons to the GitHub Releases asset URLs:
  - `https://github.com/projects-jagadishk/anahat/releases/download/v1.0.0/Anahat_1.0.0_universal.dmg`
  - `https://github.com/projects-jagadishk/anahat/releases/download/v1.0.0/Anahat_1.0.0_x64-setup.exe`
  - `https://github.com/projects-jagadishk/anahat/releases/download/v1.0.0/Anahat_1.0.0_amd64.AppImage`

### 5.2 Community Package Managers

#### macOS (Homebrew Cask)

Submit a Cask formula to `homebrew/cask` or your own tap (`projects-jagadishk/homebrew-tap`):

```ruby
cask "anahat" do
  version "1.0.0"
  sha256 "<SHA256_HASH_OF_UNIVERSAL_DMG>"

  url "https://github.com/projects-jagadishk/anahat/releases/download/v#{version}/Anahat_#{version}_universal.dmg"
  name "Anahat"
  desc "Neuroacoustic Sound Deck & Mathematical Cymatics Visualizer"
  homepage "https://anahat.app"

  app "Anahat.app"
end
```

#### Windows (Winget)

Submit a manifest to the Microsoft Community Repository (`winget-pkgs`):

```yaml
PackageIdentifier: Anahat.Anahat
PackageVersion: 1.0.0
Publisher: Anahat
PackageName: Anahat
License: MIT
Installers:
  - Architecture: x64
    InstallerType: nullsoft
    InstallerUrl: https://github.com/projects-jagadishk/anahat/releases/download/v1.0.0/Anahat_1.0.0_x64-setup.exe
    InstallerSha256: <SHA256_HASH>
```

---

## 6. Over-The-Air (OTA) Auto-Updates

Anahat is architected to support Tauri v2's auto-updater plugin (`@tauri-apps/plugin-updater`).

1. **Generate Keypair:**
   ```bash
   npx @tauri-apps/cli signer generate -w ~/.tauri/anahat.key
   ```
2. **Add Public Key to `tauri.conf.json`:**
   ```json
   "plugins": {
     "updater": {
       "endpoints": [
         "https://releases.anahat.app/updates/{{target}}/{{current_version}}"
       ],
       "pubkey": "YOUR_TAURI_UPDATER_PUBLIC_KEY"
     }
   }
   ```
3. Whenever a new version is built, Tauri signs the update archive and outputs a `latest.json` manifest that clients poll in the background.

---

## 7. Pre-Flight Release Checklist

- [x] **Version Parity:** `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` all synchronized to `1.0.0`.
- [x] **TypeScript Check:** `npx tsc --noEmit` passes with 0 errors.
- [x] **Astro Production Build:** `npm run build` generates `/dist` static bundle cleanly.
- [x] **Rust Safety:** `cargo check --manifest-path src-tauri/Cargo.toml` passes with 0 warnings/errors.
- [x] **Static Landing Site:** `website/index.html` functional, high-contrast brutalist styling verified, assets linked.
- [x] **Documentation Integrity:** `README.md`, `PRD.md`, `BUILD_PLAN.md`, and `DISTRIBUTION.md` complete and aligned.
