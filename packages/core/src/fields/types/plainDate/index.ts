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
import formatISO from 'date-fns/formatISO';

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
      return new Date(`${value}T00:00Z`);
    };

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
          isIndexed === 'unique' ? { arg: graphql.arg({ type: graphql.PlainDate }) } : undefined,
        where: {
          arg: graphql.arg({ type: filters[meta.provider].DateTime[mode] }),
          resolve: mode === 'optional' ? filters.resolveCommon : undefined,
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
              val = defaultValue;
            }
            return resolveInput(val);
          },
        },
        update: { arg: graphql.arg({ type: graphql.PlainDate }) },
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
