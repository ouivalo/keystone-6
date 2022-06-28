import { getGqlNames } from '../../../types';
import { graphql } from '../../..';
import { InitialisedListOrSingleton } from '../types-for-lists';
import * as queries from './resolvers';

export function getQueriesForList(list: InitialisedListOrSingleton) {
  if (!list.graphql.isEnabled.query) return {};
  const names = getGqlNames(list);

  if (list.kind === 'singleton') {
    const findSingleton = graphql.field({
      type: list.types.output,
      async resolve(_rootVal, args, context) {
        return queries.findSingleton(list, context);
      },
    });

    return {
      [names.itemQueryName]: findSingleton,
    };
  }

  if (list.kind === 'list') {
    const findOne = graphql.field({
      type: list.types.output,
      args: { where: graphql.arg({ type: graphql.nonNull(list.types.uniqueWhere) }) },
      async resolve(_rootVal, args, context) {
        return queries.findOne(args, list, context);
      },
    });

    const findMany = graphql.field({
      type: graphql.list(graphql.nonNull(list.types.output)),
      args: list.types.findManyArgs,
      async resolve(_rootVal, args, context, info) {
        return queries.findMany(args, list, context, info);
      },
    });

    const countQuery = graphql.field({
      type: graphql.Int,
      args: { where: graphql.arg({ type: graphql.nonNull(list.types.where), defaultValue: {} }) },
      async resolve(_rootVal, args, context, info) {
        return queries.count(args, list, context, info);
      },
    });

    return {
      [names.listQueryName]: findMany,
      [names.itemQueryName]: findOne,
      [names.listQueryCountName]: countQuery,
    };
  }
}
