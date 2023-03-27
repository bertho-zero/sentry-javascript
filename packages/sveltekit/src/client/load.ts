import type { BaseClient } from '@sentry/core';
import { getCurrentHub, trace } from '@sentry/core';
import type { Breadcrumbs, BrowserTracing } from '@sentry/svelte';
import { captureException } from '@sentry/svelte';
import type { ClientOptions } from '@sentry/types';
import {
  addExceptionMechanism,
  addTracingHeadersToFetchRequest,
  getFetchMethod,
  getFetchUrl,
  objectify,
  stringMatchesSomePattern,
  stripUrlQueryAndFragment,
} from '@sentry/utils';
import type { Load, LoadEvent } from '@sveltejs/kit';

function sendErrorToSentry(e: unknown): unknown {
  // In case we have a primitive, wrap it in the equivalent wrapper class (string -> String, etc.) so that we can
  // store a seen flag on it.
  const objectifiedErr = objectify(e);

  captureException(objectifiedErr, scope => {
    scope.addEventProcessor(event => {
      addExceptionMechanism(event, {
        type: 'sveltekit',
        handled: false,
        data: {
          function: 'load',
        },
      });
      return event;
    });

    return scope;
  });

  return objectifiedErr;
}

/**
 * Wrap load function with Sentry. This wrapper will
 *
 * - catch errors happening during the execution of `load`
 * - create a load span if performance monitoring is enabled
 * - attach tracing Http headers to `fech` requests if performance monitoring is enabled to get connected traces.
 * - add a fetch breadcrumb for every `fetch` request
 *
 * Note that tracing Http headers are only attached if the url matches the specified `tracePropagationTargets`
 * entries to avoid CORS errors.
 *
 * @param origLoad SvelteKit user defined load function
 */
export function wrapLoadWithSentry(origLoad: Load): Load {
  return new Proxy(origLoad, {
    apply: (wrappingTarget, thisArg, args: Parameters<Load>) => {
      const [event] = args;

      const patchedEvent = {
        ...event,
        fetch: instrumentSvelteKitFetch(event.fetch),
      };

      const routeId = event.route.id;
      return trace(
        {
          op: 'function.sveltekit.load',
          name: routeId ? routeId : event.url.pathname,
          status: 'ok',
          metadata: {
            source: routeId ? 'route' : 'url',
          },
        },
        () => wrappingTarget.apply(thisArg, [patchedEvent]),
        sendErrorToSentry,
      );
    },
  });
}

type SvelteKitFetch = LoadEvent['fetch'];

/**
 * Instruments SvelteKit's client `fetch` implementation which is passed to the client-side universal `load` functions.
 *
 * We need to instrument this in addition to the native fetch we instrument in BrowserTracing because SvelteKit
 * stores the native fetch implementation before our SDK is initialized.
 *
 * see: https://github.com/sveltejs/kit/blob/master/packages/kit/src/runtime/client/fetcher.js
 *
 * This instrumentation takes the fetch-related options from `BrowserTracing` to determine if we should
 * instrument fetch for perfomance monitoring, create a span for or attach our tracing headers to the given request.
 *
 * To dertermine if breadcrumbs should be recorded, this instrumentation relies on the availability of and the options
 * set in the `BreadCrumbs` integration.
 *
 * @param originalFetch SvelteKit's original fetch implemenetation
 *
 * @returns a proxy of SvelteKit's fetch implementation
 */
function instrumentSvelteKitFetch(originalFetch: SvelteKitFetch): SvelteKitFetch {
  const client = getCurrentHub().getClient() as BaseClient<ClientOptions>;

  const browserTracingIntegration =
    client.getIntegrationById && (client.getIntegrationById('BrowserTracing') as BrowserTracing | undefined);
  const breadcrumbsIntegration = client.getIntegrationById('BreadCrumbs') as Breadcrumbs | undefined;

  const browserTracingOptions = browserTracingIntegration && browserTracingIntegration.options;

  const shouldTraceFetch = browserTracingOptions && browserTracingOptions.traceFetch;
  const shouldAddFetchBreadcrumbs = breadcrumbsIntegration && breadcrumbsIntegration.options.fetch;

  /* Identical check as in BrowserTracing, just that we also need to verify that BrowserTracing is actually installed */
  const shouldCreateSpan =
    browserTracingOptions && typeof browserTracingOptions.shouldCreateSpanForRequest === 'function'
      ? browserTracingOptions.shouldCreateSpanForRequest
      : (_: string) => shouldTraceFetch;

  /* Identical check as in BrowserTracing, just that we also need to verify that BrowserTracing is actually installed */
  const shouldAttachHeaders: (url: string) => boolean = url => {
    return (
      !!shouldTraceFetch &&
      stringMatchesSomePattern(url, browserTracingOptions.tracePropagationTargets || ['localhost', /^\//])
    );
  };

  return new Proxy(originalFetch, {
    apply: (wrappingTarget, thisArg, args: Parameters<LoadEvent['fetch']>) => {
      const [input, init] = args;
      const rawUrl = getFetchUrl(args);
      const sanitizedUrl = stripUrlQueryAndFragment(rawUrl);
      const method = getFetchMethod(args);

      // TODO: extract this to a util function (and use it in breadcrumbs integration as well)
      if (rawUrl.match(/sentry_key/) && method === 'POST') {
        // We will not create breadcrumbs for fetch requests that contain `sentry_key` (internal sentry requests)
        return wrappingTarget.apply(thisArg, args);
      }

      const patchedInit: RequestInit = { ...init } || {};
      const activeSpan = getCurrentHub().getScope().getSpan();
      const activeTransaction = activeSpan && activeSpan.transaction;

      const attachHeaders = shouldAttachHeaders(rawUrl);
      const attachSpan = shouldCreateSpan(rawUrl);

      if (attachHeaders && attachSpan && activeTransaction) {
        const dsc = activeTransaction.getDynamicSamplingContext();
        const headers = addTracingHeadersToFetchRequest(
          input as string | Request,
          dsc,
          activeSpan,
          patchedInit as {
            headers:
              | {
                  [key: string]: string[] | string | undefined;
                }
              | Request['headers'];
          },
        ) as HeadersInit;
        patchedInit.headers = headers;
      }

      let fetchPromise: Promise<Response>;

      if (attachSpan) {
        fetchPromise = trace(
          {
            name: `${method} ${sanitizedUrl}`, // this will become the description of the span
            op: 'http.client',
            data: {
              /* TODO: extract query data (we might actually only do this once we tackle sanitization on the browser-side) */
            },
            parentSpanId: activeSpan && activeSpan.spanId,
          },
          async span => {
            const fetchResult: Response = await wrappingTarget.apply(thisArg, [input, patchedInit]);
            if (span) {
              span.setHttpStatus(fetchResult.status);
            }
            return fetchResult;
          },
        );
      } else {
        fetchPromise = wrappingTarget.apply(thisArg, [input, patchedInit]);
      }

      if (shouldAddFetchBreadcrumbs) {
        addFetchBreadcrumbs(fetchPromise, method, sanitizedUrl, args);
      }

      return fetchPromise;
    },
  });
}

/* Adds breadcrumbs for the given fetch result */
function addFetchBreadcrumbs(
  fetchResult: Promise<Response>,
  method: string,
  sanitizedUrl: string,
  args: Parameters<SvelteKitFetch>,
): void {
  const breadcrumbStartTimestamp = Date.now();
  fetchResult.then(
    response => {
      getCurrentHub().addBreadcrumb(
        {
          type: 'http',
          category: 'fetch',
          data: {
            method: method,
            url: sanitizedUrl,
            status_code: response.status,
          },
        },
        {
          input: args,
          response,
          startTimestamp: breadcrumbStartTimestamp,
          endTimestamp: Date.now(),
        },
      );
    },
    error => {
      getCurrentHub().addBreadcrumb(
        {
          type: 'http',
          category: 'fetch',
          level: 'error',
          data: {
            method: method,
            url: sanitizedUrl,
          },
        },
        {
          input: args,
          data: error,
          startTimestamp: breadcrumbStartTimestamp,
          endTimestamp: Date.now(),
        },
      );
    },
  );
}
