import type { EntitySchema } from '../../types/connector.js';

export const gdriveSchema: EntitySchema = {
  source: 'gdrive',
  entities: [
    {
      type: 'file',
      fields: [
        { name: 'id', type: 'string', filterable: true },
        { name: 'name', type: 'string', filterable: true },
        { name: 'mimeType', type: 'string', filterable: true },
        { name: 'path', type: 'string', filterable: true },
        { name: 'owner', type: 'string', filterable: true },
        { name: 'size', type: 'number', filterable: true },
        { name: 'createdAt', type: 'datetime', filterable: true },
        { name: 'modifiedAt', type: 'datetime', filterable: true },
      ],
      relationships: [
        { name: 'parent', targetType: 'folder', cardinality: 'one' },
      ],
    },
    {
      type: 'folder',
      fields: [
        { name: 'id', type: 'string', filterable: true },
        { name: 'name', type: 'string', filterable: true },
        { name: 'path', type: 'string', filterable: true },
        { name: 'owner', type: 'string', filterable: true },
        { name: 'createdAt', type: 'datetime', filterable: true },
      ],
      relationships: [
        { name: 'parent', targetType: 'folder', cardinality: 'one' },
        { name: 'children', targetType: ['file', 'folder'], cardinality: 'many' },
      ],
    },
  ],
};
