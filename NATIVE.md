# Progress as a real iPhone and Android app

The app in `ios/` and `android/` is the same Progress you already use, wrapped with
Capacitor. The difference is that it reads **Apple Health** (iPhone) or **Health Connect**
(Android) directly. Nobody needs to build Shortcuts.

- Readings go to the same `/api/ingest` endpoint, so the server and database don't change.
- The web version at progress-v38v.vercel.app carries on working exactly as before.

You don't need a Mac. **Codemagic** builds the app on its Macs, in the cloud.

---

## iPhone: get it onto your phone through TestFlight

Do these once, in a web browser.

### 1. Join the Apple Developer Program ($99 a year)
developer.apple.com/programs → **Enroll**, as an individual. Approval can take up to 48 hours.

### 2. Register the app's ID with HealthKit switched on
1. developer.apple.com → Account → **Certificates, Identifiers & Profiles** → **Identifiers** → **+**.
2. Choose **App IDs → App**.
3. Description: `Progress`.
4. Bundle ID (Explicit): `uk.co.eddtech.progress`.
5. Under Capabilities, tick **HealthKit**, then **Continue → Register**.

### 3. Create the app in App Store Connect
1. appstoreconnect.apple.com → **Apps** → **+** → **New App**.
2. Fill in:
   - Platform: iOS
   - Name: e.g. *Progress – Pacing Coach* (names must be unique on the App Store)
   - Language: English (UK)
   - Bundle ID: `uk.co.eddtech.progress`
   - SKU: `progress`
3. Open the new app → **App Information**, and copy the **Apple ID** number. Send it to Claude, or put it in `codemagic.yaml` as `APP_STORE_APPLE_ID`.

### 4. Make an API key so Codemagic can upload builds
1. App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API** → **+**.
2. Name: `Codemagic`. Access: **App Manager**.
3. Download the `.p8` file (you can only download it once).
4. Note the **Key ID** and the **Issuer ID**.

### 5. Set up Codemagic (free: 500 build minutes a month)
1. codemagic.io → sign up **with GitHub** → **Add application** → choose `eddchalkley-bit/progress`.
   Codemagic finds `codemagic.yaml` automatically.
2. Your avatar → **Personal Account** → **Integrations** → **Developer Portal** → **Connect**.
   Name it exactly `Progress App Store Connect key`, then add the Issuer ID, Key ID and `.p8` file.
3. **Code signing identities** → **iOS certificates** → **Generate certificate** (Apple Distribution).
4. Make the provisioning profile:
   1. On developer.apple.com → **Profiles** → **+** → **App Store Connect**.
   2. Choose `uk.co.eddtech.progress`, then the certificate Codemagic just made.
   3. Name it `Progress App Store`.
5. Back in Codemagic → **iOS provisioning profiles** → **Fetch profiles** and pick it.

### 6. Build
Codemagic → the Progress app → **Start new build** → workflow **iPhone → TestFlight**.
It takes about 10–15 minutes. Apple then processes the build for another 10–30 minutes.

### 7. Install it
1. App Store Connect → the app → **TestFlight** → **Internal Testing** → **+** → add yourself.
2. On your iPhone, install **TestFlight** from the App Store. Progress appears there → **Install**.
3. Open Progress → **Settings** → paste your token → **Connect Apple Health** → **Turn On All** → **Allow**.

The first read brings in the last 90 days. After that it reads every time you open the app.
You can delete the Shortcuts automations once you're happy with it.

---

## Android

### Try it now (free, no Google account needed)
1. Codemagic → **Start new build** → **Android → test APK**.
2. Download the `.apk` from the build page onto an Android phone and open it (allow "install unknown apps").
3. Health Connect is built into Android 14+. On older phones, install *Health Connect by Android* from the Play Store.

### Google Play (when ready)
1. **Play Console account:** a one-off registration fee and an identity check.
2. **Testing first:** new personal accounts must run a **closed test with at least 12 testers, opted in for 14 days in a row**, before Google allows a public release.
3. **Health declaration:** Google reviews every health permission. The app only asks for the eight it reads, and the rest are removed in `AndroidManifest.xml`. In the Play Console's Health apps declaration, say what each one is used for.
4. **Signing key in Codemagic:** Codemagic → **Code signing identities** → **Android keystores** → **Generate keystore**, with the reference name `progress_upload_key`.
5. **Upload access:** create a Google Cloud service account with Play Console access. Add its JSON to a Codemagic environment group called `google_play` as `GCLOUD_SERVICE_ACCOUNT_CREDENTIALS`.
6. **Build:** **Start new build** → **Android → Google Play**. It uploads to the internal testing track as a draft.

---

## Before a public release
- **Accounts:** today Progress is single-user (one token). A public app needs sign-up and per-person data.
- **Privacy policy:** `public/privacy.html` is a draft. Add your contact email and have it checked.
- **Wording:** keep it a pacing diary and coach, not a medical device. Avoid "diagnose", "treat" and "predict crashes" in store listings.
- **App Store listing:** screenshots (6.7" iPhone), description, keywords, support URL, age rating, and the App Privacy questionnaire (Health & Fitness data, linked to the user, not used for tracking).

## What's in the code
- `capacitor.config.json` — app ID `uk.co.eddtech.progress`. Change it before the first store upload if you want a different one.
- `src/lib/native.js` — reads Health and turns it into the same lines the Shortcut sends.
- `ios/App/App/Info.plist` — the wording shown when asking for Health access.
- `ios/App/App/App.entitlements` — the HealthKit capability.
- `android/app/src/main/AndroidManifest.xml` — Health Connect permissions, read-only, only the ones used.
- `codemagic.yaml` — the cloud builds.
- When you change the web app, the next Codemagic build picks it up. Nothing extra to do.
