/**
 * Acme onboarding flow — base URL → API key → validation → workspace selection.
 */

import { OnboardingFlow, InputStep, ValidationStep, SelectStep } from "@max/connector";
import { AcmeHttpClient } from "@max/acme";
import { AcmeApiToken } from "./credentials.js";
import type { AcmeConfig } from "./config.js";

export const AcmeOnboarding = OnboardingFlow.create<AcmeConfig>([
  InputStep.create({
    label: "Connection details",
    description: "Enter your Acme tenant URL and API key",
    fields: {
      baseUrl: { label: "Tenant URL", type: "string", required: true },
    },
    credentials: { api_token: AcmeApiToken },
  }),

  ValidationStep.create({
    label: "Verify credentials",
    async validate(accumulated, { credentialStore }) {
      const token = await credentialStore.get("api_token");
      const baseUrl = accumulated.baseUrl as string;
      const client = new AcmeHttpClient({ baseUrl, apiKey: token });
      await client.listWorkspaces();
    },
  }),

  SelectStep.create({
    label: "Choose workspace",
    field: "workspaceId",
    async options(accumulated, { credentialStore }) {
      const token = await credentialStore.get("api_token");
      const baseUrl = accumulated.baseUrl as string;
      const client = new AcmeHttpClient({ baseUrl, apiKey: token });
      const workspaces = await client.listWorkspaces();
      return workspaces.map((ws) => ({ label: ws.name, value: ws.id }));
    },
  }),
]);
