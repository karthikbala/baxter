# Android push setup

The recovered source contains only `android/app/build.gradle`, not a complete buildable Android project. Restore the Capacitor configuration, Android wrapper, native notification channel implementation, bundled sound, Gradle wrapper, and resources before using `scripts/build-android.mjs`. The web/PWA application runs independently of the native wrapper.

## Configure your own Firebase project

1. Register your Android application in your Firebase project and use your own application ID if distributing a fork.
2. Place its `google-services.json` in `android/app/`; Git ignores this file.
3. Create an appropriately scoped Firebase messaging service account. Keep its private JSON outside source control and mount it read-only into the worker. Set `FCM_CREDENTIALS_PATH` to that mounted path.
4. Build and sign using your own Android SDK, JDK, signing key, and distribution process after restoring the missing project files.
5. Point the wrapper at your own HTTPS workspace and sign in using the configured account credentials.
6. Enable notifications and send a test push. Verify receipt, sound, tap-to-case navigation, and acknowledgement on a physical phone, including behaviour in the background and under device notification settings.

`scripts/verify-fcm.mjs <private-credential-path>` performs a validation-only provider request. It does not deliver a notification or prove device receipt. Never commit service-account JSON, signing keys, filled environment files, or device tokens.

The PWA supports Web Push independently. Permission, subscription, delivery, and sound depend on the browser, HTTPS origin, operating system, and device settings. Notification sound must respect Android's settings and Do Not Disturb.

References: [Firebase server authorization](https://firebase.google.com/docs/cloud-messaging/send/v1-api), [Capacitor push notifications](https://capacitorjs.com/docs/apis/push-notifications).
