import { GraphQLSchema } from 'graphql';
import {
  BaseStandardListTypeInfo,
  KeystoneDbAPI,
  KeystoneListsAPI,
  KeystoneContext,
  GqlNames,
  BaseListTypeInfo,
} from '../../types';
import { executeGraphQLFieldToRootVal } from './executeGraphQLFieldToRootVal';
import { executeGraphQLFieldWithSelection } from './executeGraphQLFieldWithSelection';

export function getDbAPIFactory(
  gqlNames: GqlNames,
  schema: GraphQLSchema,
  kind: 'list' | 'singleton'
): (context: KeystoneContext) => KeystoneDbAPI<Record<string, BaseListTypeInfo>>[string] {
  const f = (operation: 'query' | 'mutation', fieldName: string) => {
    const rootType = operation === 'mutation' ? schema.getMutationType()! : schema.getQueryType()!;
    const field = rootType.getFields()[fieldName];

    if (field === undefined) {
      return (): never => {
        // This will be triggered if the field is missing due to `omit` configuration.
        // The GraphQL equivalent would be a bad user input error.
        throw new Error(`This ${operation} is not supported by the GraphQL schema: ${fieldName}()`);
      };
    }
    return executeGraphQLFieldToRootVal(field);
  };

  const api =
    kind === 'singleton'
      ? {
          read: f('query', gqlNames.itemQueryName),
          update: f('mutation', gqlNames.updateMutationName),
        }
      : {
          findOne: f('query', gqlNames.itemQueryName),
          findMany: f('query', gqlNames.listQueryName),
          count: f('query', gqlNames.listQueryCountName),
          createOne: f('mutation', gqlNames.createMutationName),
          createMany: f('mutation', gqlNames.createManyMutationName),
          updateOne: f('mutation', gqlNames.updateMutationName),
          updateMany: f('mutation', gqlNames.updateManyMutationName),
          deleteOne: f('mutation', gqlNames.deleteMutationName),
          deleteMany: f('mutation', gqlNames.deleteManyMutationName),
        };

  return (context: KeystoneContext) => {
    return {
      ...(Object.fromEntries(
        Object.entries(api).map(([key, impl]) => [
          key,
          (args: Record<string, any>) => impl(args, context),
        ])
      ) as Record<keyof typeof api, any>),
      kind,
    };
  };
}

export function itemAPIForList(
  listKey: string,
  context: KeystoneContext
): KeystoneListsAPI<Record<string, BaseStandardListTypeInfo>>[string] {
  const f = (operation: 'query' | 'mutation', field: string) => {
    const exec = executeGraphQLFieldWithSelection(context.graphql.schema, operation, field);
    return ({ query, ...args }: { query?: string } & Record<string, any> = {}) => {
      const returnFields = query ?? 'id';
      return exec(args, returnFields, context);
    };
  };
  const gqlNames = context.gqlNames(listKey);

  return {
    findOne: f('query', gqlNames.itemQueryName),
    findMany: f('query', gqlNames.listQueryName),
    async count({ where = {} } = {}) {
      const { listQueryCountName, whereInputName } = context.gqlNames(listKey);
      const query = `query ($where: ${whereInputName}!) { count: ${listQueryCountName}(where: $where)  }`;
      const response = await context.graphql.run({ query, variables: { where } });
      return response.count;
    },
    createOne: f('mutation', gqlNames.createMutationName),
    createMany: f('mutation', gqlNames.createManyMutationName),
    updateOne: f('mutation', gqlNames.updateMutationName),
    updateMany: f('mutation', gqlNames.updateManyMutationName),
    deleteOne: f('mutation', gqlNames.deleteMutationName),
    deleteMany: f('mutation', gqlNames.deleteManyMutationName),
  };
}
