import type { EntitySchema } from '../../types/connector.js';

export const linearSchema: EntitySchema = {
  source: 'linear',
  entities: [
    {
      type: 'issue',
      fields: [
        { name: 'id', type: 'string', filterable: true },
        { name: 'identifier', type: 'string', filterable: true, description: 'e.g. ENG-123' },
        { name: 'title', type: 'string', filterable: true },
        { name: 'description', type: 'string', filterable: false },
        { name: 'state', type: 'string', filterable: true, description: 'e.g. In Progress, Done' },
        { name: 'priority', type: 'number', filterable: true, description: '0=none, 1=urgent, 2=high, 3=medium, 4=low' },
        { name: 'assignee', type: 'string', filterable: true },
        { name: 'creator', type: 'string', filterable: true },
        { name: 'project', type: 'string', filterable: true },
        { name: 'team', type: 'string', filterable: true },
        { name: 'labels', type: 'json', filterable: false },
        { name: 'createdAt', type: 'datetime', filterable: true },
        { name: 'updatedAt', type: 'datetime', filterable: true },
        { name: 'completedAt', type: 'datetime', filterable: true },
        { name: 'url', type: 'string', filterable: false },
      ],
      relationships: [
        { name: 'project', targetType: 'project', cardinality: 'one' },
        { name: 'comments', targetType: 'comment', cardinality: 'many' },
      ],
    },
    {
      type: 'project',
      fields: [
        { name: 'id', type: 'string', filterable: true },
        { name: 'name', type: 'string', filterable: true },
        { name: 'description', type: 'string', filterable: false },
        { name: 'state', type: 'string', filterable: true },
        { name: 'lead', type: 'string', filterable: true },
        { name: 'team', type: 'string', filterable: true },
        { name: 'startDate', type: 'datetime', filterable: true },
        { name: 'targetDate', type: 'datetime', filterable: true },
        { name: 'createdAt', type: 'datetime', filterable: true },
        { name: 'updatedAt', type: 'datetime', filterable: true },
        { name: 'url', type: 'string', filterable: false },
      ],
      relationships: [
        { name: 'issues', targetType: 'issue', cardinality: 'many' },
      ],
    },
    {
      type: 'comment',
      fields: [
        { name: 'id', type: 'string', filterable: true },
        { name: 'body', type: 'string', filterable: false },
        { name: 'author', type: 'string', filterable: true },
        { name: 'issueId', type: 'string', filterable: true },
        { name: 'issueIdentifier', type: 'string', filterable: true },
        { name: 'createdAt', type: 'datetime', filterable: true },
        { name: 'updatedAt', type: 'datetime', filterable: true },
        { name: 'url', type: 'string', filterable: false },
      ],
      relationships: [
        { name: 'issue', targetType: 'issue', cardinality: 'one' },
      ],
    },
  ],
};
