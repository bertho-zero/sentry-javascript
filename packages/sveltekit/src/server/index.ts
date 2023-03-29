// Node SDK exports
// Unfortunately, we cannot `exprt * from '@sentry/node'` because our CJS output mistakenly
// puts these exports into a `default` rather than on the top-level namespace.
// Hence, we export everything from the Node SDK explicitly:
export {
  addGlobalEventProcessor,
  addBreadcrumb,
  captureException,
  captureEvent,
  captureMessage,
  configureScope,
  createTransport,
  extractTraceparentData,
  getActiveTransaction,
  getHubFromCarrier,
  getCurrentHub,
  Hub,
  makeMain,
  Scope,
  startTransaction,
  SDK_VERSION,
  setContext,
  setExtra,
  setExtras,
  setTag,
  setTags,
  setUser,
  spanStatusfromHttpCode,
  trace,
  withScope,
  autoDiscoverNodePerformanceMonitoringIntegrations,
  makeNodeTransport,
  defaultIntegrations,
  defaultStackParser,
  lastEventId,
  flush,
  close,
  getSentryRelease,
  addRequestDataToEvent,
  DEFAULT_USER_INCLUDES,
  extractRequestData,
  deepReadDirSync,
  Integrations,
  Handlers,
} from '@sentry/node';

// We can still leave this for the carrier init and type exports
export * from '@sentry/node';

// -------------------------
// SvelteKit SDK exports:
export { init } from './sdk';
export { handleErrorWithSentry } from './handleError';
export { wrapLoadWithSentry } from './load';
export { sentryHandle } from './handle';
