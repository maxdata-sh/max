import type { EntitySchema } from '../../types/connector.js';

export const hubspotSchema: EntitySchema = {
  source: 'hubspot',
  entities: [
    {
      type: 'contact',
      fields: [
        { name: 'id', type: 'string', filterable: true },
        { name: 'email', type: 'string', filterable: true },
        { name: 'firstName', type: 'string', filterable: true },
        { name: 'lastName', type: 'string', filterable: true },
        { name: 'phone', type: 'string', filterable: true },
        { name: 'company', type: 'string', filterable: true },
        { name: 'jobTitle', type: 'string', filterable: true },
        { name: 'lifecycleStage', type: 'string', filterable: true, description: 'e.g. lead, customer, subscriber' },
        { name: 'owner', type: 'string', filterable: true },
        { name: 'createdAt', type: 'datetime', filterable: true },
        { name: 'updatedAt', type: 'datetime', filterable: true },
        { name: 'url', type: 'string', filterable: false },
      ],
      relationships: [
        { name: 'company', targetType: 'company', cardinality: 'one' },
        { name: 'deals', targetType: 'deal', cardinality: 'many' },
      ],
    },
    {
      type: 'company',
      fields: [
        { name: 'id', type: 'string', filterable: true },
        { name: 'name', type: 'string', filterable: true },
        { name: 'domain', type: 'string', filterable: true },
        { name: 'industry', type: 'string', filterable: true },
        { name: 'phone', type: 'string', filterable: true },
        { name: 'city', type: 'string', filterable: true },
        { name: 'state', type: 'string', filterable: true },
        { name: 'country', type: 'string', filterable: true },
        { name: 'owner', type: 'string', filterable: true },
        { name: 'createdAt', type: 'datetime', filterable: true },
        { name: 'updatedAt', type: 'datetime', filterable: true },
        { name: 'url', type: 'string', filterable: false },
      ],
      relationships: [
        { name: 'contacts', targetType: 'contact', cardinality: 'many' },
        { name: 'deals', targetType: 'deal', cardinality: 'many' },
      ],
    },
    {
      type: 'deal',
      fields: [
        { name: 'id', type: 'string', filterable: true },
        { name: 'name', type: 'string', filterable: true },
        { name: 'stage', type: 'string', filterable: true, description: 'e.g. appointmentscheduled, qualifiedtobuy, closedwon' },
        { name: 'pipeline', type: 'string', filterable: true },
        { name: 'amount', type: 'number', filterable: true },
        { name: 'closeDate', type: 'datetime', filterable: true },
        { name: 'owner', type: 'string', filterable: true },
        { name: 'createdAt', type: 'datetime', filterable: true },
        { name: 'updatedAt', type: 'datetime', filterable: true },
        { name: 'url', type: 'string', filterable: false },
      ],
      relationships: [
        { name: 'contacts', targetType: 'contact', cardinality: 'many' },
        { name: 'company', targetType: 'company', cardinality: 'one' },
      ],
    },
  ],
};
