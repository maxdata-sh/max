/**
 * Onboarding CLI Runner — Interprets OnboardingFlow step types via a Prompter.
 *
 * Walks through steps in order, accumulating config. Credentials go to the
 * credential store during collection, never into accumulated config.
 *
 * Works in both direct mode (real readline) and daemon mode (socket-proxied)
 * because all I/O goes through the Prompter abstraction.
 */

import type { OnboardingFlow, OnboardingContext, OnboardingStep } from "@max/connector";
import type { Prompter } from "./prompter.js";

export async function runOnboarding<TConfig>(
  flow: OnboardingFlow<TConfig>,
  ctx: OnboardingContext,
  prompter: Prompter,
): Promise<TConfig> {
  const accumulated: Record<string, unknown> = {};

  for (const step of flow.steps) {
    await executeStep(step, accumulated, ctx, prompter);
  }

  return accumulated as TConfig;
}

// ============================================================================
// Step Handlers
// ============================================================================

async function executeStep(
  step: OnboardingStep,
  accumulated: Record<string, unknown>,
  ctx: OnboardingContext,
  prompter: Prompter,
): Promise<void> {
  switch (step.kind) {
    case "input":
      return handleInput(step, accumulated, ctx, prompter);
    case "validation":
      return handleValidation(step, accumulated, ctx, prompter);
    case "select":
      return handleSelect(step, accumulated, ctx, prompter);
    case "custom":
      return handleCustom(step, accumulated, ctx);
  }
}

async function handleInput(
  step: Extract<OnboardingStep, { kind: "input" }>,
  accumulated: Record<string, unknown>,
  ctx: OnboardingContext,
  prompter: Prompter,
): Promise<void> {
  if (step.description) {
    prompter.write(`\n${step.description}\n`);
  }

  if (step.fields) {
    for (const [key, descriptor] of Object.entries(step.fields)) {
      const defaultSuffix = descriptor.default != null ? ` (${descriptor.default})` : "";
      const value = await prompter.ask(`${descriptor.label}${defaultSuffix}: `);

      const resolved = value || (descriptor.default != null ? String(descriptor.default) : value);
      accumulated[key] = coerce(resolved, descriptor.type);
    }
  }

  if (step.credentials) {
    for (const [_key, credential] of Object.entries(step.credentials)) {
      const value = await prompter.ask(`${step.label}: `);
      await ctx.credentialStore.set(credential.name, value);
    }
  }
}

async function handleValidation(
  step: Extract<OnboardingStep, { kind: "validation" }>,
  accumulated: Record<string, unknown>,
  ctx: OnboardingContext,
  prompter: Prompter,
): Promise<void> {
  prompter.write(`${step.label}...`);

  try {
    await step.validate(accumulated, ctx);
    prompter.write(" done\n");
  } catch (err) {
    prompter.write(" failed\n");
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Validation failed: ${message}`);
  }
}

async function handleSelect(
  step: Extract<OnboardingStep, { kind: "select" }>,
  accumulated: Record<string, unknown>,
  ctx: OnboardingContext,
  prompter: Prompter,
): Promise<void> {
  const options = await step.options(accumulated, ctx);

  prompter.write(`\n${step.label}:\n`);
  for (let i = 0; i < options.length; i++) {
    prompter.write(`  ${i + 1}. ${options[i].label}\n`);
  }

  const answer = await prompter.ask("> ");
  const index = parseInt(answer, 10) - 1;

  if (isNaN(index) || index < 0 || index >= options.length) {
    throw new Error(`Invalid selection: ${answer}`);
  }

  accumulated[step.field] = options[index].value;
}

async function handleCustom(
  step: Extract<OnboardingStep, { kind: "custom" }>,
  accumulated: Record<string, unknown>,
  ctx: OnboardingContext,
): Promise<void> {
  const additions = await step.execute(accumulated, ctx);
  Object.assign(accumulated, additions);
}

// ============================================================================
// Helpers
// ============================================================================

function coerce(value: string, type: "string" | "number" | "boolean"): string | number | boolean {
  switch (type) {
    case "number": return Number(value);
    case "boolean": return value === "true" || value === "1" || value === "yes";
    default: return value;
  }
}
