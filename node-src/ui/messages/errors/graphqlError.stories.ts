import { GraphQLError } from '../../../io/graphqlClient';
import graphqlError from './graphqlError';

export default {
  title: 'CLI/Messages/Errors',
};

const err: GraphQLError = {
  message:
    'Cannot query field "inheritedCaptureCount" on type "Build". Did you mean "potentialCaptureCount", "billableCaptureCount", or "actualCaptureCount"?',
  locations: [{ line: 11, column: 7 }],
  extensions: {
    code: 'GRAPHQL_VALIDATION_FAILED',
    exception: {
      stacktrace: [
        'GraphQLError: Cannot query field "inheritedCaptureCount" on type "Build". Did you mean "potentialCaptureCount", "billableCaptureCount", or "actualCaptureCount"?',
        '    at Object.Field (/app/node_modules/graphql/validation/rules/FieldsOnCorrectTypeRule.js:48:31)',
        '    at Object.enter (/app/node_modules/graphql/language/visitor.js:323:29)',
        '    at Object.enter (/app/node_modules/graphql/utilities/TypeInfo.js:370:25)',
        '    at visit (/app/node_modules/graphql/language/visitor.js:243:26)',
        '    at Object.validate (/app/node_modules/graphql/validation/validate.js:69:24)',
        '    at null.validate (/app/node_modules/apollo-server-core/src/requestPipeline.ts:536:14)',
        '    at Object.<anonymous> (/app/node_modules/apollo-server-core/src/requestPipeline.ts:302:32)',
        '    at Generator.next (<anonymous>)',
        '    at fulfilled (/app/node_modules/apollo-server-core/dist/requestPipeline.js:5:58)',
      ],
    },
  },
};

export const GraphqlError = () => graphqlError({ title: 'Run a job' }, err);
