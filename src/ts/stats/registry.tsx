/**
 * Stat module contract. Deliberately imports NO stat modules, so the modules
 * can import `defineStat` from here without creating an import cycle. The
 * populated list lives in `allStats.tsx`.
 *
 * Every analytics feature is a pure `compute(dataset)` paired with a `Card`
 * presentation component. `compute` must be pure and synchronous, must derive
 * "now" from `dataset.meta.fetchedAt` (never `Date.now()`) so results are
 * deterministic, and must tolerate empty and partial datasets without throwing.
 *
 * `register()` erases a module's result type behind a single `Render` component.
 * This sidesteps the variance problem of storing `StatModule<SpecificResult>`
 * values in one array (the result type appears in the contravariant `Card`
 * prop, so specific modules are not assignable to a common `StatModule<unknown>`).
 */

import type { FunctionComponent } from "preact";

import type { Dataset } from "../model/types";

export interface StatModule<TResult = unknown> {
  id: string; // stable, kebab-case
  title: string;
  description: string;
  compute: (dataset: Dataset) => TResult;
  Card: FunctionComponent<{ result: TResult }>;
}

/**
 * Preserves the type link between a module's `compute` return value and the
 * `result` prop of its `Card`, so registration stays type-safe.
 */
export function defineStat<TResult>(
  module: StatModule<TResult>,
): StatModule<TResult> {
  return module;
}

/** A stat with its result type erased behind a single `Render` component. */
export interface RegisteredStat {
  id: string;
  title: string;
  description: string;
  Render: FunctionComponent<{ dataset: Dataset }>;
}

export function register<TResult>(module: StatModule<TResult>): RegisteredStat {
  const Card = module.Card;
  const Render: FunctionComponent<{ dataset: Dataset }> = ({ dataset }) => (
    <Card result={module.compute(dataset)} />
  );
  return {
    id: module.id,
    title: module.title,
    description: module.description,
    Render,
  };
}
