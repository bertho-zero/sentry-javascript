<p align="center">
  <a href="https://sentry.io/?utm_source=github&utm_medium=logo" target="_blank">
    <img src="https://sentry-brand.storage.googleapis.com/sentry-wordmark-dark-280x84.png" alt="Sentry" width="280" height="84">
  </a>
</p>

# Official Sentry SDK for SvelteKit

[![npm version](https://img.shields.io/npm/v/@sentry/sveltekit.svg)](https://www.npmjs.com/package/@sentry/sveltekit)
[![npm dm](https://img.shields.io/npm/dm/@sentry/sveltekit.svg)](https://www.npmjs.com/package/@sentry/sveltekit)
[![npm dt](https://img.shields.io/npm/dt/@sentry/sveltekit.svg)](https://www.npmjs.com/package/@sentry/sveltekit)

<!--
TODO: No docs yet, comment back in once we have docs
## Links

- [Official SDK Docs](https://docs.sentry.io/platforms/javascript/guides/sveltekit/)
- [TypeDoc](http://getsentry.github.io/sentry-javascript/) -->

## SDK Status

This SDK is currently in **Alpha state** and we're still experimenting with APIs and functionality. We therefore make no guarantees in terms of semver or breaking changes. If you want to try this SDK and come across a problem, please open a [GitHub Issue](https://github.com/getsentry/sentry-javascript/issues/new/choose).

## Compatibility

Currently, the minimum supported version of SvelteKit is `1.0.0`.

## General

This package is a wrapper around `@sentry/node` for the server and `@sentry/svelte` for the client, with added functionality related to SvelteKit.

## Usage

Although the SDK is not yet stable, you're more than welcome to give it a try and provide us with early feedback.

**Here's how to get started:**

1. Ensure you've set up the [`@sveltejs/adapter-node` adapter](https://kit.svelte.dev/docs/adapter-node)

2. Install the Sentry SvelteKit SDK:

   ```bash
   # Using npm
   npm install @sentry/sveltekit

   # Using yarn
   yarn add @sentry/sveltekit
   ```

3. Create a `sentry.client.config.(js|ts)` file in the root directory of your SvelteKit project.
   In this file you can configure the client-side Sentry SDK just like every other browser-based SDK:

   ```javascript
    import * as Sentry from '@sentry/sveltekit';

    Sentry.init({
      dsn: '__DSN__',

      // For instance, initialize Session Replay:
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      integrations: [new Sentry.Replay()]
    });
   ```

4. Add our `withSentryViteConfig` wrapper around your Vite config so that the Sentry SDK is added to your application in `vite.config.(js|ts)`:
   ```javascript
    import { sveltekit } from '@sveltejs/kit/vite';
    import { withSentryViteConfig } from '@sentry/sveltekit';

    export default withSentryViteConfig({
      plugins: [sveltekit()],
      // ...
    });
   ```

5. Create a `sentry.server.config.(js|ts)` file in the root directory of your SvelteKit project.
   In this file you can configure the server-side Sentry SDK, like the Sentry Node SDK:

   ```javascript
    import * as Sentry from '@sentry/sveltekit';

    Sentry.init({
      dsn: '__DSN__',
    });
   ```

6. To catch errors in your `load` functions in `+page.(js|ts)`, wrap our `wrapLoadWithSentry` function:

   ```javascript
    import { wrapLoadWithSentry } from '@sentry/sveltekit';

    export const load = wrapLoadWithSentry((event) => {
      //...
    });
   ```

7. In your `hooks.client.(js|ts)` or `hooks.server.(js|ts)`, you can wrap the `handleError` function as follows:

   ```javascript
    import { handleErrorWithSentry } from '@sentry/sveltekit';
    import type { HandleClientError } from '@sveltejs/kit';

    const myErrorHandler = ((input) => {
      console.log('This is the client error handler');
      console.log(input.error);
    }) satisfies HandleClientError;

    export const handleError = handleErrorWithSentry(myErrorHandler);

    // or alternatively, if you don't have a custom error handler:
    // export const handleError = handleErrorWithSentry();
   ```

## Known Limitations

This SDK is still under active development and several features are missing.
Take a look at our [SvelteKit SDK Development Roadmap](https://github.com/getsentry/sentry-javascript/issues/6692) to follow the progress:

- **Performance monitoring** is not yet fully supported.
  You can add the `BrowserTracing` integration but proper instrumentation for routes, page loads and navigations is still missing.
  This will be addressed next, as we release the next alpha builds.

- **Source Maps** upload is not yet working correctly.
  We already investigated [some options](https://github.com/getsentry/sentry-javascript/discussions/5838#discussioncomment-4696985) but uploading source maps doesn't work automtatically out of the box yet.
  This will be addressed next, as we release the next alpha builds.

- **Adapters** other than `@sveltejs/adapter-node` are currently not supported.
  We haven't yet tested other platforms like Vercel.
  This is on our roadmap but it will come at a later time.

- We're aiming to **simplify SDK setup** in the future so that you don't have to go in and manually add our wrappers to all your `load` functions and hooks.
  This will be addressed once the SDK supports all Sentry features.
