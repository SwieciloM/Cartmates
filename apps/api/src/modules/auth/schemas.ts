export const errorSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        requestId: { type: 'string' },
        fields: { type: 'object', additionalProperties: { type: 'string' } },
      },
    },
  },
} as const;

export const userResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['user', 'householdId'],
  properties: {
    user: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'displayName', 'email', 'createdAt'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        displayName: { type: 'string' },
        email: { type: 'string', format: 'email' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
    householdId: {
      type: 'null',
      description: 'Households are introduced in phase 3.',
    },
  },
} as const;

const credentials = {
  email: {
    type: 'string',
    format: 'email',
    maxLength: 254,
    description:
      'Trimmed and lowercased before validation; no provider-specific normalization.',
  },
  password: {
    type: 'string',
    minLength: 12,
    maxLength: 128,
    description: 'Preserved exactly, including whitespace.',
  },
} as const;
export const loginBody = {
  type: 'object',
  additionalProperties: false,
  required: ['email', 'password'],
  properties: credentials,
} as const;
export const registerBody = {
  type: 'object',
  additionalProperties: false,
  required: ['displayName', 'email', 'password'],
  properties: {
    ...credentials,
    displayName: {
      type: 'string',
      minLength: 1,
      maxLength: 60,
      description: 'Trimmed before validation; Unicode is preserved.',
    },
  },
} as const;
export const authErrors = Object.fromEntries(
  Object.entries({
    400: 'VALIDATION_ERROR',
    401: 'UNAUTHENTICATED',
    403: 'FORBIDDEN',
    409: 'EMAIL_TAKEN',
    413: 'PAYLOAD_TOO_LARGE',
    415: 'UNSUPPORTED_MEDIA_TYPE',
    429: 'RATE_LIMITED',
    500: 'INTERNAL_ERROR',
  }).map(([status, code]) => [
    status,
    {
      ...errorSchema,
      description:
        status === '401'
          ? 'Missing, invalid, or expired session; login uses INVALID_CREDENTIALS for incorrect credentials.'
          : status === '429'
            ? 'More than 10 attempts per minute per IP for this endpoint. Retry-After gives seconds until retry.'
            : status === '403'
              ? 'A mutation requires an allowlisted Origin, including login, registration, and logout.'
              : code,
      examples: [
        {
          error: {
            code,
            message: 'Request could not be completed',
            requestId: 'req-example',
          },
        },
      ],
    },
  ]),
);
