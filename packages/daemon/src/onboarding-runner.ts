/**
 * Onboarding CLI Runner — Interprets OnboardingFlow step types with terminal prompts.
 *
 * Walks through steps in order, accumulating config. Credentials go to the
 * credential store during collection, never into accumulated config.
 */

import { createInterface } from "node:readline";
import type { OnboardingFlow, OnboardingContext, OnboardingStep } from "@max/connector";

// FIXME: CLAUDE: Not yet. But - when we've resolved everything else, we need to pull this out and actually use the onboarding runner.

// ============================================================================
// Terminal I/O
// ============================================================================

function createPrompter() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return {
    ask(message: string): Promise<string> {
      return new Promise((resolve) => {
        rl.question(message, (answer) => resolve(answer.trim()));
      });
    },
    close() {
      rl.close();
    },
  };
}

// ============================================================================
// Runner
// ============================================================================

export async function runOnboardingCli<TConfig>(
  flow: OnboardingFlow<TConfig>,
  ctx: OnboardingContext,
): Promise<TConfig> {
  const accumulated: Record<string, unknown> = {};
  const prompter = createPrompter();

  try {
    for (const step of flow.steps) {
      await executeStep(step, accumulated, ctx, prompter);
    }
  } finally {
    prompter.close();
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
  prompter: { ask(msg: string): Promise<string> },
): Promise<void> {
  switch (step.kind) {
    case "input":
      return handleInput(step, accumulated, ctx, prompter);
    case "validation":
      return handleValidation(step, accumulated, ctx);
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
  prompter: { ask(msg: string): Promise<string> },
): Promise<void> {
  if (step.description) {
    process.stdout.write(`\n${step.description}\n`);
  }

  // Collect plain config fields
  if (step.fields) {
    for (const [key, descriptor] of Object.entries(step.fields)) {
      const defaultSuffix = descriptor.default != null ? ` (${descriptor.default})` : "";
      const value = await prompter.ask(`${descriptor.label}${defaultSuffix}: `);

      const resolved = value || (descriptor.default != null ? String(descriptor.default) : value);
      accumulated[key] = coerce(resolved, descriptor.type);
    }
  }

  // Collect credentials — written to store, NOT accumulated
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
): Promise<void> {
  process.stdout.write(`${step.label}...`);

  try {
    await step.validate(accumulated, ctx);
    process.stdout.write(" done\n");
  } catch (err) {
    process.stdout.write(" failed\n");
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Validation failed: ${message}`);
  }
}

async function handleSelect(
  step: Extract<OnboardingStep, { kind: "select" }>,
  accumulated: Record<string, unknown>,
  ctx: OnboardingContext,
  prompter: { ask(msg: string): Promise<string> },
): Promise<void> {
  const options = await step.options(accumulated, ctx);

  process.stdout.write(`\n${step.label}:\n`);
  for (let i = 0; i < options.length; i++) {
    process.stdout.write(`  ${i + 1}. ${options[i].label}\n`);
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
