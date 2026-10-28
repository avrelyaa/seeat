# Seeat

Seeat is a mobile food marketplace built with Expo and Firebase for Android and iOS. Buyers discover food from independent sellers, order ahead, and coordinate pickup. Any verified email may register.

## Implemented starter flows

- Buyer and seller sign-up with email verification
- Food discovery by search and category
- Seller storefront settings, QRIS image, food listings, pre-order deadline, and manual stock editing
- Up to three swipeable food photos per listing, with a separate illustrated placeholder when no photo is uploaded
- Transactional stock reservation when a buyer orders
- Direct seller QRIS display, buyer proof submission for online orders, optional proof for on-site orders, seller payment confirmation, and order status tracking
- Buyer cancellation of unpaid orders with transactional stock restoration
- Firebase Authentication, Cloud Firestore, and access rules
- Owner admin tools for seller verification, listing moderation, and report resolution

This is a working code starter, **not a deployed or production-ready service**. The Firebase project is connected and security rules are published, but signed native builds and real user testing are still required.

## Connected Firebase project

The Firebase project is `seeat-b0e90` on Spark. Email/Password Authentication is enabled. Cloud Firestore Standard edition is in `asia-southeast2` (Jakarta), and the rules in `firestore.rules` were published on October 25, 2026 after emulator tests passed. The public Firebase app configuration is in the ignored `.env` file. Do not enable billing or Cloud Storage for this pilot.

For a different Firebase project in the future:

1. Sign in to [Firebase Console](https://console.firebase.google.com/) with the Google account that should own Seeat. Create a project named **Seeat** on the **Spark** plan. Google Analytics is optional.
2. Create Cloud Firestore in **production mode**, preferably in `asia-southeast2` (Jakarta). Enable Authentication → Sign-in method → **Email/Password**. Do **not** enable Cloud Storage; it requires a billing-linked Blaze plan.
3. In Project settings, add a **Web app** named Seeat. The Expo mobile app uses Firebase's JavaScript SDK, which obtains its public configuration from this Firebase app registration. It does not make Seeat web-only. Copy the four values into `.env` using `.env.example`: API key, auth domain, project ID, and app ID.
4. Use Node.js 24.12 or newer. Run `npm install`, `npm run typecheck`, `npm run lint`, then `npm run web`. Register a buyer and seller with any real emails and verify both.
5. Sign in to Firebase CLI with `npx firebase-tools@latest login`, update `.firebaserc` to the new project ID, and test `firestore.rules` in the emulator before deployment.
6. Test ordering, stock cancellation, QRIS readability, proof submission, and seller confirmation using two accounts.

Firebase web configuration values are public app identifiers; Firestore rules enforce access. Never place service account credentials in `.env`.

## No-billing image storage

Seeat's pilot stores compressed QRIS, proof, and food images in Firestore. Food listings allow up to three JPEG images of under 250,000 characters each. Payment proof lives in a separate `proofs/{orderId}` document readable only by the buyer and seller. This avoids Cloud Storage billing, but it consumes Firestore document storage and read bandwidth. Cloud Firestore limits a document to 1 MiB. Keep an eye on Spark plan quotas, and move food photos to a dedicated storage service before wider use.

## Admin access

The account owner creates an `admins/{uid}` document in Firebase Console for their verified Firebase Authentication user. Only the Firebase Console can create this record; client apps cannot grant themselves admin access. That user then sees an **Admin** tab and can verify or unverify sellers, review and resolve reports, and hide or restore listings. The app does not contain a shared admin password; use the account's normal Firebase sign-in. Email sign-in remains the only supported login method until a private username lookup service is available.

## Optional mobile web release

1. Log in and select the Firebase project: `npx firebase-tools@latest login`, then `npx firebase-tools@latest use --add`.
2. Run `npm run typecheck` and `npm run build:web`.
3. Test rules and flows against the Firebase Emulator Suite before public use.
4. Deploy rules and web assets: `npx firebase-tools@latest deploy --only firestore:rules,hosting`.

Firebase Hosting serves the web build at the project's `web.app` address. Android and iOS store binaries require separate Expo EAS builds, signing, and store accounts.

## Prepare Android and iOS builds

`eas.json` contains an internal preview profile and a production profile. Sign in with an Expo account (`npx eas-cli@latest login`), link this directory to an EAS project (`npx eas-cli@latest init`), choose stable Android and iOS application IDs, and put the four `EXPO_PUBLIC_FIREBASE_*` values in the matching EAS environments. Use `npx eas-cli@latest build --platform all --profile preview` for tester builds, then `--profile production` for store binaries. iOS device distribution requires an Apple Developer account; publishing to Google Play requires a Play Console account. The account owner must handle store agreements and signing credentials.

## Before a wider launch

- Add automatic expiry for abandoned unpaid reservations. Manual cancellation already restores stock atomically.
- Existing listings with a legacy `campus` field remain readable and editable. New listings no longer set a campus.
- Define a seller verification checklist and report response process before broader use.
- Validate Firestore rules in the emulator with malicious-client cases.
- Add food photos, notifications, clearer pickup scheduling, and accessibility review.
- Confirm payment operationally: screenshots do **not** prove a QRIS transfer settled.
- Review dependency advisories and Firebase Spark usage before launch.

The current dependency audit reports high-severity advisories in transitive Expo build tooling and Firebase's Node gRPC package. Do not treat a successful bundle as security clearance for production.

Seeat does not hold or route payments. Commission collection is not implemented.
