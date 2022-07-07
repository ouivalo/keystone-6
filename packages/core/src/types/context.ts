import { IncomingMessage } from 'http';
import { Readable } from 'stream';
import { GraphQLSchema, ExecutionResult, DocumentNode } from 'graphql';
import { InitialisedList } from '../lib/core/types-for-lists';
import { BaseStandardListTypeInfo, BaseListTypeInfo, BaseSingletonTypeInfo } from './type-info';
import { GqlNames, BaseKeystoneTypeInfo } from '.';

export type KeystoneContext<TypeInfo extends BaseKeystoneTypeInfo = BaseKeystoneTypeInfo> = {
  req?: IncomingMessage;
  db: KeystoneDbAPI<TypeInfo['lists']>;
  query: KeystoneListsAPI<TypeInfo['lists']>;
  graphql: KeystoneGraphQLAPI;
  sudo: () => KeystoneContext<TypeInfo>;
  exitSudo: () => KeystoneContext<TypeInfo>;
  withSession: (session: any) => KeystoneContext<TypeInfo>;
  prisma: TypeInfo['prisma'];
  files: FilesContext;
  images: ImagesContext;
  totalResults: number;
  maxTotalResults: number;
  /** @deprecated */
  gqlNames: (listKey: string) => GqlNames;
  experimental?: {
    /** @deprecated This value is only available if you have config.experimental.contextInitialisedLists = true.
     * This is not a stable API and may contain breaking changes in `patch` level releases.
     */
    initialisedLists: Record<string, InitialisedList>;
  };
} & Partial<SessionContext<any>>;

// List item API

// TODO: Work out whether we can generate useful return types based on the GraphQL Query
// passed to List API functions (see `readonly Record<string, any>` below)

export type KeystoneSingletonListsAPI<ListTypeInfo extends BaseSingletonTypeInfo> = {
  read(args: ResolveFields): Promise<Record<string, any>>;
  update(
    args: {
      readonly data: ListTypeInfo['inputs']['update'];
    } & ResolveFields
  ): Promise<Record<string, any>>;
};

export type KeystoneStandardListsAPI<ListTypeInfo extends BaseStandardListTypeInfo> = {
  findMany(
    args?: {
      readonly where?: ListTypeInfo['inputs']['where'];
      readonly take?: number;
      readonly skip?: number;
      readonly orderBy?:
        | ListTypeInfo['inputs']['orderBy']
        | readonly ListTypeInfo['inputs']['orderBy'][];
    } & ResolveFields
  ): Promise<readonly Record<string, any>[]>;
  findOne(
    args: {
      readonly where: ListTypeInfo['inputs']['uniqueWhere'];
    } & ResolveFields
  ): Promise<Record<string, any>>;
  count(args?: { readonly where?: ListTypeInfo['inputs']['where'] }): Promise<number>;
  updateOne(
    args: {
      readonly where: ListTypeInfo['inputs']['uniqueWhere'];
      readonly data: ListTypeInfo['inputs']['update'];
    } & ResolveFields
  ): Promise<Record<string, any>>;
  updateMany(
    args: {
      readonly data: readonly {
        readonly where: ListTypeInfo['inputs']['uniqueWhere'];
        readonly data: ListTypeInfo['inputs']['update'];
      }[];
    } & ResolveFields
  ): Promise<Record<string, any>[]>;
  createOne(
    args: { readonly data: ListTypeInfo['inputs']['create'] } & ResolveFields
  ): Promise<Record<string, any>>;
  createMany(
    args: {
      readonly data: readonly ListTypeInfo['inputs']['create'][];
    } & ResolveFields
  ): Promise<Record<string, any>[]>;
  deleteOne(
    args: {
      readonly where: ListTypeInfo['inputs']['uniqueWhere'];
    } & ResolveFields
  ): Promise<Record<string, any> | null>;
  deleteMany(
    args: {
      readonly where: readonly ListTypeInfo['inputs']['uniqueWhere'][];
    } & ResolveFields
  ): Promise<Record<string, any>[]>;
};

type KeystoneListAPI<ListTypeInfo extends BaseListTypeInfo> =
  ListTypeInfo extends BaseStandardListTypeInfo
    ? KeystoneStandardListsAPI<ListTypeInfo>
    : ListTypeInfo extends BaseSingletonTypeInfo
    ? KeystoneSingletonListsAPI<ListTypeInfo>
    : never;

export type KeystoneListsAPI<KeystoneListsTypeInfo extends Record<string, BaseListTypeInfo>> = {
  [Key in keyof KeystoneListsTypeInfo]: KeystoneListAPI<KeystoneListsTypeInfo[Key]>;
};

type ResolveFields = {
  /**
   * @default 'id'
   */
  readonly query?: string;
};

export type KeystoneStandardListDbAPI<ListTypeInfo extends BaseStandardListTypeInfo> = {
  kind: 'list';
  findMany(args?: {
    readonly where?: ListTypeInfo['inputs']['where'];
    readonly take?: number;
    readonly skip?: number;
    readonly orderBy?:
      | ListTypeInfo['inputs']['orderBy']
      | readonly ListTypeInfo['inputs']['orderBy'][];
  }): Promise<readonly ListTypeInfo['item'][]>;
  findOne(args: {
    readonly where: ListTypeInfo['inputs']['uniqueWhere'];
  }): Promise<ListTypeInfo['item']>;
  count(args?: { readonly where?: ListTypeInfo['inputs']['where'] }): Promise<number>;
  updateOne(args: {
    readonly where: ListTypeInfo['inputs']['uniqueWhere'];
    readonly data: ListTypeInfo['inputs']['update'];
  }): Promise<ListTypeInfo['item']>;
  updateMany(args: {
    readonly data: readonly {
      readonly where: ListTypeInfo['inputs']['uniqueWhere'];
      readonly data: ListTypeInfo['inputs']['update'];
    }[];
  }): Promise<ListTypeInfo['item'][]>;
  createOne(args: {
    readonly data: ListTypeInfo['inputs']['create'];
  }): Promise<ListTypeInfo['item']>;
  createMany(args: {
    readonly data: readonly ListTypeInfo['inputs']['create'][];
  }): Promise<ListTypeInfo['item'][]>;
  deleteOne(args: {
    readonly where: ListTypeInfo['inputs']['uniqueWhere'];
  }): Promise<ListTypeInfo['item']>;
  deleteMany(args: {
    readonly where: readonly ListTypeInfo['inputs']['uniqueWhere'][];
  }): Promise<ListTypeInfo['item'][]>;
};

type KeystoneSingletonListDbAPI<ListTypeInfo extends BaseSingletonTypeInfo> = {
  kind: 'singleton';
  read(): Promise<ListTypeInfo['item']>;
  update(args: { readonly data: ListTypeInfo['inputs']['update'] }): Promise<ListTypeInfo['item']>;
};

export type KeystoneIndividualDbAPI<ListTypeInfo extends BaseListTypeInfo> =
  ListTypeInfo extends BaseStandardListTypeInfo
    ? KeystoneStandardListDbAPI<ListTypeInfo>
    : ListTypeInfo extends BaseSingletonTypeInfo
    ? KeystoneSingletonListDbAPI<ListTypeInfo>
    : never;

export type KeystoneDbAPI<KeystoneListsTypeInfo extends Record<string, BaseListTypeInfo>> = {
  [Key in keyof KeystoneListsTypeInfo]: KeystoneIndividualDbAPI<KeystoneListsTypeInfo[Key]>;
};

// GraphQL API

export type KeystoneGraphQLAPI = {
  schema: GraphQLSchema;
  run: (args: GraphQLExecutionArguments) => Promise<Record<string, any>>;
  raw: (args: GraphQLExecutionArguments) => Promise<ExecutionResult>;
};

type GraphQLExecutionArguments = {
  query: string | DocumentNode;
  variables?: Record<string, any>;
};

// Session API

export type SessionContext<T> = {
  // Note: session is typed like this to acknowledge the default session shape
  // if you're using keystone's built-in session implementation, but we don't
  // actually know what it will look like.
  session?: { itemId: string; listKey: string; data?: Record<string, any> } | any;
  startSession(data: T): Promise<string>;
  endSession(): Promise<void>;
};

export type AssetMode = 'local' | 's3';

// Files API

export type FileMetadata = {
  filename: string;
  filesize: number;
};

export type FileData = {
  filename: string;
} & FileMetadata;

export type FilesContext = (storage: string) => {
  getUrl: (filename: string) => Promise<string>;
  getDataFromStream: (stream: Readable, filename: string) => Promise<FileData>;
  deleteAtSource: (filename: string) => Promise<void>;
};

// Images API

export type ImageExtension = 'jpg' | 'png' | 'webp' | 'gif';

export type ImageMetadata = {
  extension: ImageExtension;
  filesize: number;
  width: number;
  height: number;
};

export type ImageData = {
  id: string;
} & ImageMetadata;

export type ImagesContext = (storage: string) => {
  getUrl: (id: string, extension: ImageExtension) => Promise<string>;
  getDataFromStream: (stream: Readable, filename: string) => Promise<ImageData>;
  deleteAtSource: (id: string, extension: ImageExtension) => Promise<void>;
};
