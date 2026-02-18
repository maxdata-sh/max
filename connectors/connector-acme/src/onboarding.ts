/**
 * Acme onboarding flow — base URL → API key → validation → workspace selection.
 */

import { OnboardingFlow, InputStep, ValidationStep, SelectStep } from "@max/connector";
import { AcmeHttpClient } from "@max/acme";
import { AcmeApiToken } from "./credentials.js";
import type { AcmeConfig } from "./config.js";

export const AcmeOnboarding = OnboardingFlow.create<AcmeConfig>([
  // FIXME: I think we ought to be able to treat credentials like fields.
  // Right now there's a rendering bug where, when this prints in the terminal, when I'm asked for the credentials, the read line prompt just says "Connection details". I think that's because there is no label.
  // But what would make more sense is to have a reference to a credential and for it to be a credential field, and then to have those rendered as password protected in the terminal.
  InputStep.create({
    label: 'Connection details',
    description: 'Enter your Acme tenant URL and API key',
    fields: {
      baseUrl: { label: 'Tenant URL', type: 'string', required: true },
    },
    credentials: { api_token: AcmeApiToken },
  }),

  ValidationStep.create({
    label: 'Verify credentials',
    async validate(accumulated, { credentialStore }) {
      const token = await credentialStore.get('api_token')
      const baseUrl = accumulated.baseUrl as string
      const client = new AcmeHttpClient({ baseUrl, apiKey: token })
      await client.listWorkspaces()
    },
  }),

  SelectStep.create({
    label: 'Choose workspace',
    field: 'workspaceId',
    async options(accumulated, { credentialStore }) {
      const token = await credentialStore.get('api_token')
      const baseUrl = accumulated.baseUrl as string
      const client = new AcmeHttpClient({ baseUrl, apiKey: token })
      const workspaces = await client.listWorkspaces()
      return workspaces.map((ws) => ({ label: ws.name, value: ws.id }))
    },
  }),
])
