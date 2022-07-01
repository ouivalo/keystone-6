import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { Server } from 'http';
import express from 'express';
import supertest, { Test } from 'supertest';
import memoizeOne from 'memoize-one';
import type {
  KeystoneConfig,
  KeystoneContext,
  BaseKeystoneTypeInfo,
  ListsConfig,
  ListConfig,
  BaseSingletonTypeInfo,
  BaseFields,
  BaseStandardListTypeInfo,
} from './types';
import { SingletonConfig } from './types/config/lists';

import {
  getCommittedArtifacts,
  writeCommittedArtifacts,
  requirePrismaClient,
  generateNodeModulesArtifacts,
} from './artifacts';
import { pushPrismaSchemaToDatabase } from './migrations';
import { initConfig, createSystem, createExpressServer } from './system';

export type GraphQLRequest = (arg: {
  query: string;
  variables?: Record<string, any>;
  operationName?: string;
}) => Test;

export type TestArgs<TypeInfo extends BaseKeystoneTypeInfo = BaseKeystoneTypeInfo> = {
  context: KeystoneContext<TypeInfo>;
  graphQLRequest: GraphQLRequest;
  app: express.Express;
  server: Server;
};

export type TestEnv<TypeInfo extends BaseKeystoneTypeInfo = BaseKeystoneTypeInfo> = {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  testArgs: TestArgs<TypeInfo>;
};

const _hashPrismaSchema = memoizeOne(prismaSchema =>
  crypto.createHash('md5').update(prismaSchema).digest('hex')
);
const _alreadyGeneratedProjects = new Set<string>();

type Blah<Lists extends ListsConfig> = {
  prisma: any;
  lists: {
    [Key in keyof Lists]: Blah2<Lists[Key]>;
  };
};

type Blah2<
  List extends
    | SingletonConfig<BaseSingletonTypeInfo, BaseFields<BaseSingletonTypeInfo>>
    | ListConfig<BaseStandardListTypeInfo, BaseFields<BaseStandardListTypeInfo>>
> = List extends SingletonConfig<BaseSingletonTypeInfo, BaseFields<BaseSingletonTypeInfo>>
  ? BaseSingletonTypeInfo
  : List extends ListConfig<BaseStandardListTypeInfo, BaseFields<BaseStandardListTypeInfo>>
  ? BaseStandardListTypeInfo
  : never;

export async function setupTestEnv<Lists extends ListsConfig>({
  config: _config,
}: {
  config: KeystoneConfig<BaseKeystoneTypeInfo, Lists>;
}): Promise<TestEnv<Blah<Lists>>> {
  // Force the UI to always be disabled.
  const config = initConfig({ ..._config, ui: { ..._config.ui, isDisabled: true } });
  const { graphQLSchema, getKeystone } = createSystem(config);

  const artifacts = await getCommittedArtifacts(graphQLSchema, config);
  const hash = _hashPrismaSchema(artifacts.prisma);

  const artifactPath = path.resolve('.keystone', 'tests', hash);

  if (!_alreadyGeneratedProjects.has(hash)) {
    _alreadyGeneratedProjects.add(hash);
    fs.mkdirSync(artifactPath, { recursive: true });
    await writeCommittedArtifacts(artifacts, artifactPath);
    await generateNodeModulesArtifacts(graphQLSchema, config, artifactPath);
  }
  await pushPrismaSchemaToDatabase(
    config.db.url,
    config.db.shadowDatabaseUrl,
    artifacts.prisma,
    path.join(artifactPath, 'schema.prisma'),
    true // shouldDropDatabase
  );

  const { connect, disconnect, createContext } = getKeystone(requirePrismaClient(artifactPath));

  const {
    expressServer: app,
    apolloServer,
    httpServer: server,
  } = await createExpressServer(config, graphQLSchema, createContext);

  const graphQLRequest: GraphQLRequest = ({ query, variables = undefined, operationName }) =>
    supertest(app)
      .post(config.graphql?.path || '/api/graphql')
      .send({ query, variables, operationName })
      .set('Accept', 'application/json');

  return {
    connect,
    disconnect: async () => {
      await Promise.all([disconnect(), apolloServer.stop()]);
    },
    testArgs: { context: createContext() as any, graphQLRequest, app, server },
  };
}

export function setupTestRunner<Lists extends ListsConfig>({
  config,
}: {
  config: KeystoneConfig<BaseKeystoneTypeInfo, Lists>;
}) {
  return (testFn: (testArgs: TestArgs<Blah<Lists>>) => Promise<void>) => async () => {
    // Reset the database to be empty for every test.
    const { connect, disconnect, testArgs } = await setupTestEnv({ config });
    await connect();
    try {
      return await testFn(testArgs);
    } finally {
      await disconnect();
    }
  };
}
