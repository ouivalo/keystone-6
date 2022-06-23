import formatISO from 'date-fns/formatISO';
import { humanize } from '../../../lib/utils';
import {
  BaseListTypeInfo,
  fieldType,
  FieldTypeFunc,
  CommonFieldConfig,
  orderDirectionEnum,
  filters,
} from '../../../types';
import { graphql } from '../../..';
import {
  assertCreateIsNonNullAllowed,
  assertReadIsNonNullAllowed,
  getResolvedIsNullable,
} from '../../non-null-graphql';
import { resolveView } from '../../resolve-view';
import { PlainDateFieldMeta } from './views';

export type PlainDateFieldConfig<ListTypeInfo extends BaseListTypeInfo> =
  CommonFieldConfig<ListTypeInfo> & {
    isIndexed?: boolean | 'unique';
    validation?: {
      isRequired?: boolean;
    };
    defaultValue?: string;
    graphql?: {
      create?: { isNonNull?: boolean };
      read?: { isNonNull?: boolean };
    };
    db?: {
      isNullable?: boolean;
      map?: string;
    };
  };

export const plainDate =
  <ListTypeInfo extends BaseListTypeInfo>({
    isIndexed,
    validation,
    defaultValue,
    ...config
  }: PlainDateFieldConfig<ListTypeInfo> = {}): FieldTypeFunc<ListTypeInfo> =>
  meta => {
    if (typeof defaultValue === 'string') {
      try {
        graphql.PlainDate.graphQLType.parseValue(defaultValue);
      } catch (err) {
        throw new Error(
          `The plainDate field at ${meta.listKey}.${meta.fieldKey} specifies defaultValue: ${defaultValue} but values must be provided as a full-date ISO8601 string such as 1970-01-01`
        );
      }
    }

    const resolvedIsNullable = getResolvedIsNullable(validation, config.db);

    assertReadIsNonNullAllowed(meta, config, resolvedIsNullable);

    assertCreateIsNonNullAllowed(meta, config);

    const mode = resolvedIsNullable === false ? 'required' : 'optional';

    const fieldLabel = config.label ?? humanize(meta.fieldKey);

    const usesNativeDateType = meta.provider === 'postgresql' || meta.provider === 'mysql';

    const resolveInput = (value: null | undefined | string) => {
      if (meta.provider === 'sqlite' || value == null) {
        return value;
      }
      return dateStringToDateObjectInUTC(value);
    };

    const commonResolveFilter = mode === 'optional' ? filters.resolveCommon : <T>(x: T) => x;

    return fieldType({
      kind: 'scalar',
      mode,
      scalar: usesNativeDateType ? 'DateTime' : 'String',
      index: isIndexed === true ? 'index' : isIndexed || undefined,
      default:
        typeof defaultValue === 'string'
          ? {
              kind: 'literal',
              value: defaultValue,
            }
          : undefined,
      map: config.db?.map,
      nativeType: usesNativeDateType ? 'Date' : undefined,
    })({
      ...config,
      hooks: {
        ...config.hooks,
        async validateInput(args) {
          const value = args.resolvedData[meta.fieldKey];
          if ((validation?.isRequired || resolvedIsNullable === false) && value === null) {
            args.addValidationError(`${fieldLabel} is required`);
          }

          await config.hooks?.validateInput?.(args);
        },
      },
      input: {
        uniqueWhere:
          isIndexed === 'unique'
            ? {
                arg: graphql.arg({ type: graphql.PlainDate }),
                resolve: usesNativeDateType ? dateStringToDateObjectInUTC : undefined,
              }
            : undefined,
        where: {
          arg: graphql.arg({
            type: mode === 'optional' ? PlainDateNullableFilter : PlainDateFilter,
          }),
          resolve: usesNativeDateType
            ? value => commonResolveFilter(transformFilterDateStringsToDateObjects(value))
            : commonResolveFilter,
        },
        create: {
          arg: graphql.arg({
            type: config.graphql?.create?.isNonNull
              ? graphql.nonNull(graphql.PlainDate)
              : graphql.PlainDate,
            defaultValue: config.graphql?.create?.isNonNull ? defaultValue : undefined,
          }),
          resolve(val: string | null | undefined) {
            if (val === undefined) {
              val = defaultValue ?? null;
            }
            return resolveInput(val);
          },
        },
        update: { arg: graphql.arg({ type: graphql.PlainDate }), resolve: resolveInput },
        orderBy: { arg: graphql.arg({ type: orderDirectionEnum }) },
      },
      output: graphql.field({
        type: config.graphql?.read?.isNonNull
          ? graphql.nonNull(graphql.PlainDate)
          : graphql.PlainDate,
        resolve({ value }) {
          if (value instanceof Date) {
            return formatISO(
              new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
              { representation: 'date' }
            );
          }
          return value;
        },
      }),
      views: resolveView('plainDate/views'),
      getAdminMeta(): PlainDateFieldMeta {
        return {
          defaultValue: defaultValue ?? null,
          isRequired: validation?.isRequired ?? false,
        };
      },
    });
  };

const dateStringToDateObjectInUTC = (value: string) => new Date(`${value}T00:00Z`);

type PlainDateFilterType = graphql.InputObjectType<{
  equals: graphql.Arg<typeof graphql.PlainDate>;
  in: graphql.Arg<graphql.ListType<graphql.NonNullType<typeof graphql.PlainDate>>>;
  notIn: graphql.Arg<graphql.ListType<graphql.NonNullType<typeof graphql.PlainDate>>>;
  lt: graphql.Arg<typeof graphql.PlainDate>;
  lte: graphql.Arg<typeof graphql.PlainDate>;
  gt: graphql.Arg<typeof graphql.PlainDate>;
  gte: graphql.Arg<typeof graphql.PlainDate>;
  not: graphql.Arg<PlainDateFilterType>;
}>;

function transformFilterDateStringsToDateObjects(
  filter: graphql.InferValueFromInputType<PlainDateFilterType>
): Parameters<typeof filters.resolveCommon>[0] {
  if (filter === null) {
    return filter;
  }
  return Object.fromEntries(
    Object.entries(filter).map(([key, value]) => {
      if (value == null) {
        return [key, value];
      }
      if (Array.isArray(value)) {
        return [key, value.map(dateStringToDateObjectInUTC)];
      }
      if (typeof value === 'object') {
        return [key, transformFilterDateStringsToDateObjects(value)];
      }
      return [key, dateStringToDateObjectInUTC(value)];
    })
  );
}

const filterFields = (nestedType: PlainDateFilterType) => ({
  equals: graphql.arg({ type: graphql.PlainDate }),
  in: graphql.arg({ type: graphql.list(graphql.nonNull(graphql.PlainDate)) }),
  notIn: graphql.arg({ type: graphql.list(graphql.nonNull(graphql.PlainDate)) }),
  lt: graphql.arg({ type: graphql.PlainDate }),
  lte: graphql.arg({ type: graphql.PlainDate }),
  gt: graphql.arg({ type: graphql.PlainDate }),
  gte: graphql.arg({ type: graphql.PlainDate }),
  not: graphql.arg({ type: nestedType }),
});

const PlainDateNullableFilter: PlainDateFilterType = graphql.inputObject({
  name: 'PlainDateNullableFilter',
  fields: () => filterFields(PlainDateNullableFilter),
});

const PlainDateFilter: PlainDateFilterType = graphql.inputObject({
  name: 'PlainDateNullableFilter',
  fields: () => filterFields(PlainDateFilter),
});
