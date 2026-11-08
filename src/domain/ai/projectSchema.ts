// The WITT project v8 JSON Schema, verbatim from the frozen prototype (witt-grace-gpt-proto/schemas/project.v8.schema.json).
// Used only as the import preflight (importReport.ts); parseProject remains the authority. Key order is the prototype's:
// the preflight walks `properties` in declaration order and the issue order is pinned by the parity tests.
import type { JsonSchema } from './jsonSchema.ts';

export const PROJECT_SCHEMA: JsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:witt:project:v8',
  title: 'WITT project v8: evidence-v3-links graph-aware scoring',
  description:
    'WITT v8: evidence-v3-links adds explicit secondary relationships to target balance, with per-assessor signed influence and overlap warnings; source credibility is evaluated once and reused.',
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'id',
    'title',
    'mode',
    'theme',
    'settings',
    'users',
    'nodes',
    'comments',
    'votes',
    'ballots',
    'createdAt',
    'updatedAt',
    'links',
    'edgeAssessments',
    'layout',
  ],
  properties: {
    schemaVersion: {
      const: 8,
    },
    id: {
      $ref: '#/$defs/id',
    },
    title: {
      $ref: '#/$defs/title',
    },
    mode: {
      enum: ['argument', 'decision'],
    },
    theme: {
      enum: ['light', 'dark', 'paper'],
    },
    settings: {
      type: 'object',
      additionalProperties: false,
      required: ['voteWeighting', 'shareSnapshotDate', 'scoring', 'assessmentWeighting'],
      properties: {
        voteWeighting: {
          enum: ['equal', 'shares'],
        },
        shareSnapshotDate: {
          type: ['string', 'null'],
          maxLength: 32,
        },
        scoring: {
          const: 'evidence-v3-links',
        },
        showAuthors: {
          type: 'boolean',
        },
        assessmentWeighting: {
          enum: ['structural', 'equal', 'shares'],
          description:
            'Required. equal = one human one review (default new projects), shares = human review weighted by shares, structural = optional document-authored baseline preview. Independent of votingRound.',
        },
      },
    },
    users: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: {
        $ref: '#/$defs/user',
      },
    },
    nodes: {
      type: 'array',
      minItems: 1,
      maxItems: 1000,
      items: {
        $ref: '#/$defs/node',
      },
    },
    votes: {
      type: 'array',
      maxItems: 10000,
      items: {
        $ref: '#/$defs/vote',
      },
    },
    ballots: {
      type: 'array',
      maxItems: 10000,
      items: {
        $ref: '#/$defs/ballot',
      },
    },
    createdAt: {
      type: 'string',
      maxLength: 50,
    },
    updatedAt: {
      type: 'string',
      maxLength: 50,
    },
    comments: {
      type: 'array',
      maxItems: 10000,
      items: {
        $ref: '#/$defs/comment',
      },
    },
    links: {
      type: 'array',
      maxItems: 2000,
      items: {
        $ref: '#/$defs/link',
      },
    },
    edgeAssessments: {
      type: 'array',
      maxItems: 10000,
      items: {
        $ref: '#/$defs/edgeAssessment',
      },
    },
    layout: {
      type: 'object',
      additionalProperties: false,
      required: ['fourWayOffsets'],
      properties: {
        fourWayOffsets: {
          type: 'object',
          maxProperties: 1000,
          additionalProperties: {
            type: 'object',
            additionalProperties: false,
            required: ['x', 'y'],
            properties: {
              x: {
                type: 'number',
                minimum: -1000000,
                maximum: 1000000,
              },
              y: {
                type: 'number',
                minimum: -1000000,
                maximum: 1000000,
              },
            },
          },
        },
      },
    },
    votingRound: {
      anyOf: [
        {
          type: 'null',
        },
        {
          type: 'object',
          additionalProperties: false,
          required: [
            'id',
            'status',
            'anonymous',
            'hideResults',
            'weighting',
            'weightByUser',
            'optionIds',
            'openedAt',
            'closedAt',
          ],
          properties: {
            id: {
              $ref: '#/$defs/id',
            },
            status: {
              enum: ['open', 'closed'],
            },
            anonymous: {
              type: 'boolean',
            },
            hideResults: {
              type: 'boolean',
            },
            weighting: {
              enum: ['equal', 'shares'],
            },
            weightByUser: {
              type: 'object',
              additionalProperties: {
                type: 'number',
                minimum: 0,
                maximum: 1000000000000,
              },
            },
            optionIds: {
              type: 'array',
              items: {
                $ref: '#/$defs/id',
              },
              minItems: 2,
              maxItems: 1000,
            },
            openedAt: {
              type: 'string',
              maxLength: 50,
            },
            closedAt: {
              type: ['string', 'null'],
              maxLength: 50,
            },
          },
        },
      ],
    },
    voteAudit: {
      type: 'array',
      maxItems: 10000,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'roundId', 'action', 'userId', 'at'],
        properties: {
          id: {
            $ref: '#/$defs/id',
          },
          roundId: {
            $ref: '#/$defs/id',
          },
          action: {
            enum: ['open', 'cast', 'update', 'retract', 'close'],
          },
          userId: {
            $ref: '#/$defs/id',
          },
          optionId: {
            $ref: '#/$defs/id',
          },
          at: {
            type: 'string',
            maxLength: 50,
          },
        },
      },
    },
    voteHistory: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['round', 'ballots', 'audit', 'titleByOption'],
        properties: {
          round: {
            type: 'object',
            additionalProperties: false,
            required: [
              'id',
              'status',
              'anonymous',
              'hideResults',
              'weighting',
              'weightByUser',
              'optionIds',
              'openedAt',
              'closedAt',
            ],
            properties: {
              id: {
                $ref: '#/$defs/id',
              },
              status: {
                const: 'closed',
              },
              anonymous: {
                type: 'boolean',
              },
              hideResults: {
                type: 'boolean',
              },
              weighting: {
                enum: ['equal', 'shares'],
              },
              weightByUser: {
                type: 'object',
                additionalProperties: {
                  type: 'number',
                  minimum: 0,
                  maximum: 1000000000000,
                },
              },
              optionIds: {
                type: 'array',
                items: {
                  $ref: '#/$defs/id',
                },
                minItems: 2,
                maxItems: 1000,
              },
              openedAt: {
                type: 'string',
                maxLength: 50,
              },
              closedAt: {
                type: 'string',
                maxLength: 50,
              },
            },
          },
          ballots: {
            type: 'array',
            maxItems: 10000,
            items: {
              $ref: '#/$defs/ballot',
            },
          },
          audit: {
            type: 'array',
            maxItems: 10000,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'roundId', 'action', 'userId', 'at'],
              properties: {
                id: {
                  $ref: '#/$defs/id',
                },
                roundId: {
                  $ref: '#/$defs/id',
                },
                action: {
                  enum: ['open', 'cast', 'update', 'retract', 'close'],
                },
                userId: {
                  $ref: '#/$defs/id',
                },
                optionId: {
                  $ref: '#/$defs/id',
                },
                at: {
                  type: 'string',
                  maxLength: 50,
                },
              },
            },
          },
          titleByOption: {
            type: 'object',
            additionalProperties: {
              type: 'string',
              maxLength: 200,
            },
          },
        },
      },
    },
    sharedReasons: {
      type: 'array',
      maxItems: 200,
      description:
        'Project-wide locked reason templates; explicit primary leaf uses reference their id. No extra score or rating dimension.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'confidence', 'influence'],
        properties: {
          id: {
            $ref: '#/$defs/id',
          },
          title: {
            $ref: '#/$defs/title',
          },
          confidence: {
            type: 'number',
            minimum: 0,
            maximum: 100,
          },
          influence: {
            type: 'number',
            minimum: -5,
            maximum: 5,
            multipleOf: 0.5,
          },
        },
      },
    },
    reasonConcepts: {
      type: 'array',
      maxItems: 200,
      description:
        'Optional reusable semantic identities. Each linked primary claim remains a separately rated contextual occurrence; concept itself has no p/w or numeric contribution.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'title', 'semanticType'],
        properties: {
          id: {
            $ref: '#/$defs/id',
          },
          title: {
            $ref: '#/$defs/title',
          },
          semanticType: {
            enum: ['fact', 'assumption', 'value'],
          },
        },
      },
    },
  },
  $defs: {
    id: {
      type: 'string',
      minLength: 1,
      maxLength: 100,
    },
    title: {
      type: 'string',
      minLength: 1,
      maxLength: 200,
    },
    user: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'name', 'shares', 'role'],
      properties: {
        id: {
          $ref: '#/$defs/id',
        },
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 120,
        },
        shares: {
          type: 'number',
          minimum: 0,
          maximum: 1000000000000,
        },
        role: {
          enum: ['owner', 'editor', 'viewer'],
        },
        profileKind: {
          enum: ['human', 'ai'],
        },
      },
    },
    node: {
      type: 'object',
      additionalProperties: false,
      required: [
        'id',
        'parentId',
        'relation',
        'kind',
        'title',
        'details',
        'confidence',
        'impact',
        'collapsed',
        'position',
        'createdBy',
      ],
      properties: {
        id: {
          $ref: '#/$defs/id',
        },
        parentId: {
          anyOf: [
            {
              $ref: '#/$defs/id',
            },
            {
              type: 'null',
            },
          ],
        },
        relation: {
          enum: ['root', 'support', 'oppose', 'neutral', 'option', 'group'],
        },
        kind: {
          enum: ['claim', 'option', 'decision', 'group'],
        },
        title: {
          $ref: '#/$defs/title',
        },
        details: {
          type: 'string',
          maxLength: 5000,
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 100,
        },
        impact: {
          type: 'number',
          minimum: 0,
          maximum: 5,
        },
        collapsed: {
          type: 'boolean',
        },
        position: {
          type: 'object',
          additionalProperties: false,
          required: ['x', 'y'],
          properties: {
            x: {
              type: 'number',
              minimum: -1000000,
              maximum: 1000000,
            },
            y: {
              type: 'number',
              minimum: -1000000,
              maximum: 1000000,
            },
          },
        },
        createdBy: {
          $ref: '#/$defs/id',
        },
        semanticType: {
          enum: ['unspecified', 'fact', 'value', 'assumption', 'constraint', 'prerequisite'],
        },
        constraintStatus: {
          enum: ['unknown', 'met', 'unmet'],
        },
        sources: {
          type: 'array',
          maxItems: 25,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['url', 'note'],
            properties: {
              url: {
                type: 'string',
                minLength: 8,
                maxLength: 1000,
                pattern: '^https?://',
              },
              note: {
                type: 'string',
                maxLength: 500,
              },
            },
          },
        },
        authorVisibility: {
          enum: ['named', 'anonymous'],
        },
        sharedReasonId: {
          $ref: '#/$defs/id',
        },
        reasonConceptId: {
          $ref: '#/$defs/id',
        },
        lastEditedBy: {
          $ref: '#/$defs/id',
          description: 'Stable profile ID of most recent semantic text editor, if tracked.',
        },
      },
    },
    vote: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'nodeId', 'userId', 'confidence', 'updatedAt'],
      properties: {
        id: {
          $ref: '#/$defs/id',
        },
        nodeId: {
          $ref: '#/$defs/id',
        },
        userId: {
          $ref: '#/$defs/id',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 100,
        },
        updatedAt: {
          type: 'string',
          maxLength: 50,
        },
      },
    },
    ballot: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'optionId', 'userId', 'preference', 'updatedAt'],
      properties: {
        id: {
          $ref: '#/$defs/id',
        },
        optionId: {
          $ref: '#/$defs/id',
        },
        userId: {
          $ref: '#/$defs/id',
        },
        preference: {
          type: 'number',
          minimum: 0,
          maximum: 100,
        },
        updatedAt: {
          type: 'string',
          maxLength: 50,
        },
      },
    },
    comment: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'nodeId', 'body', 'authorName', 'createdAt'],
      properties: {
        id: {
          $ref: '#/$defs/id',
        },
        nodeId: {
          $ref: '#/$defs/id',
        },
        body: {
          type: 'string',
          minLength: 1,
          maxLength: 3000,
        },
        authorName: {
          type: 'string',
          maxLength: 120,
        },
        createdAt: {
          type: 'string',
          minLength: 1,
          maxLength: 50,
        },
        authorId: {
          $ref: '#/$defs/id',
        },
      },
    },
    link: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'sourceId', 'targetId', 'relation', 'impact'],
      properties: {
        id: {
          $ref: '#/$defs/id',
        },
        sourceId: {
          $ref: '#/$defs/id',
        },
        targetId: {
          $ref: '#/$defs/id',
        },
        relation: {
          enum: ['support', 'oppose'],
        },
        impact: {
          type: 'number',
          minimum: 0,
          maximum: 5,
        },
        createdBy: {
          $ref: '#/$defs/id',
          description: 'Stable profile ID of relationship creator, if tracked.',
        },
      },
    },
    edgeAssessment: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'userId', 'subjectType', 'subjectId', 'influence', 'fingerprint', 'updatedAt'],
      properties: {
        id: {
          $ref: '#/$defs/id',
        },
        userId: {
          $ref: '#/$defs/id',
        },
        subjectType: {
          enum: ['primary', 'secondary'],
        },
        subjectId: {
          $ref: '#/$defs/id',
        },
        influence: {
          type: 'number',
          minimum: -5,
          maximum: 5,
          multipleOf: 0.5,
        },
        fingerprint: {
          type: 'string',
          minLength: 1,
          maxLength: 850,
        },
        updatedAt: {
          type: 'string',
          minLength: 1,
          maxLength: 50,
        },
      },
    },
  },
};
