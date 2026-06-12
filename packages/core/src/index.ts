// index.ts — API publik @sanify/core

export {
  signal,
  effect,
  computed,
  batch,
  untrack,
  on,
  onCleanup,
  onMount,
  createRoot,
  createOwner,
  runWithOwner,
  createContext,
  useContext,
  Owner,
  __debug,
} from "./reactivity/signal.ts";
export type { Getter, Setter, Context, DebugStats, OwnerNode } from "./reactivity/signal.ts";

export { createSelector, debounced, throttled } from "./reactivity/helpers.ts";

export {
  html,
  render,
  For,
  provide,
  Portal,
  ErrorBoundary,
  Suspense,
  Dynamic,
  Transition,
  TransitionGroup,
} from "./rendering/template.ts";
export type { TemplateResult, TransitionOptions } from "./rendering/template.ts";

export { Show, Switch, Match, Index } from "./rendering/flow.ts";
export type { MatchCase } from "./rendering/flow.ts";

export { component } from "./rendering/component.ts";
export type { ComponentContext, ComponentOptions, AttrConverter } from "./rendering/component.ts";

export { persisted } from "./store/store.ts";
export type { PersistOptions } from "./store/store.ts";

export { createStore, produce } from "./store/reactive.ts";
export type { SetStore } from "./store/reactive.ts";

export { createForm } from "./form/form.ts";
export type { Form, FormOptions, FieldProps, ValidateTrigger, Errors } from "./form/form.ts";

export { validators, schema } from "./form/validators.ts";
export type {
  FieldValidator,
  AsyncFieldValidator,
  SchemaResult,
  StringOptions,
  NumberOptions,
  BooleanOptions,
  EmailOptions,
} from "./form/validators.ts";

export {
  router,
  lazy,
  navigate,
  redirect,
  back,
  forward,
  current,
  params,
  query,
} from "./router/router.ts";
export type { RouteParams, RouterOptions } from "./router/router.ts";

export {
  resource,
  invalidate,
  setResourceData,
  getResourceData,
} from "./resource/resource.ts";
export type { Resource, ResourceOptions } from "./resource/resource.ts";

export { mutation } from "./resource/mutation.ts";
export type { Mutation, MutationOptions } from "./resource/mutation.ts";

export { createClient, HttpError } from "./resource/client.ts";
export type {
  Client,
  ClientOptions,
  RequestInterceptor,
  ResponseInterceptor,
} from "./resource/client.ts";
