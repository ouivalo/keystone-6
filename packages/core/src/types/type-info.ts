import { KeystoneContext } from './context';
import { BaseItem } from './next-fields';

type GraphQLInput = Record<string, any>;

export type BaseSingletonTypeInfo = {
  kind: 'singleton';
  key: string;
  fields: string;
  item: BaseItem;
  inputs: {
    update: GraphQLInput;
    create: never;
  };
  all: BaseKeystoneTypeInfo;
};

export type BaseStandardListTypeInfo = {
  kind: 'list';
  key: string;
  fields: string;
  item: BaseItem;
  inputs: {
    create: GraphQLInput;
    update: GraphQLInput;
    where: GraphQLInput;
    uniqueWhere: { readonly id?: string | null } & GraphQLInput;
    orderBy: Record<string, 'asc' | 'desc' | null>;
  };
  all: BaseKeystoneTypeInfo;
};

export type BaseListTypeInfo = BaseSingletonTypeInfo | BaseStandardListTypeInfo;

export type KeystoneContextFromListTypeInfo<ListTypeInfo extends BaseListTypeInfo> =
  KeystoneContext<ListTypeInfo['all']>;

export type BaseKeystoneTypeInfo = {
  lists: Record<string, BaseStandardListTypeInfo | BaseSingletonTypeInfo>;
  prisma: any;
};
