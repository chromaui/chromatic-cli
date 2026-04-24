/* eslint-disable max-lines */
import GraphQLClient from '../../io/graphqlClient';
import {
  AncestorBuild,
  AnnouncedBuild,
  BaselineBuild,
  ChromaticApi,
  ChromaticApiCallOptions,
  FirstCommittedAt,
  LastBuildInfo,
  MergedPullRequest,
  PublishedBuild,
  ReportBuild,
  ReportTokenCallOptions,
  SnapshotBuildState,
  StartedBuild,
  UploadBuildResult,
  UploadMetadataResult,
  VerifiedBuild,
} from './chromaticApi';

const CreateCLITokenMutation = `
  mutation CreateCLITokenMutation($projectId: String!) {
    cliToken: createCLIToken(projectId: $projectId)
  }
`;

const CreateAppTokenMutation = `
  mutation CreateAppTokenMutation($projectToken: String!) {
    appToken: createAppToken(code: $projectToken)
  }
`;

const AnnounceBuildMutation = `
  mutation AnnounceBuildMutation($input: AnnounceBuildInput!) {
    announceBuild(input: $input) {
      id
      number
      browsers
      status
      autoAcceptChanges
      reportToken
      features {
        uiTests
        uiReview
        isReactNativeApp
      }
      app {
        id
        turboSnapAvailability
      }
    }
  }
`;

const SkipBuildMutation = `
  mutation SkipBuildMutation($commit: String!, $branch: String, $slug: String) {
    skipBuild(commit: $commit, branch: $branch, slug: $slug)
  }
`;

const PublishBuildMutation = `
  mutation PublishBuildMutation($id: ID!, $input: PublishBuildInput!) {
    publishBuild(id: $id, input: $input) {
      status
      storybookUrl
    }
  }
`;

const StartedBuildQuery = `
  query StartedBuildQuery($number: Int!) {
    app {
      build(number: $number) {
        startedAt
        failureReason
        upgradeBuilds {
          completedAt
        }
      }
    }
  }
`;

const VerifyBuildQuery = `
  query VerifyBuildQuery($number: Int!) {
    app {
      build(number: $number) {
        id
        number
        status(legacy: false)
        specCount
        componentCount
        testCount
        changeCount
        errorCount: testCount(statuses: [BROKEN])
        actualTestCount: testCount(statuses: [IN_PROGRESS])
        actualCaptureCount
        inheritedCaptureCount
        interactionTestFailuresCount
        webUrl
        browsers {
          browser
        }
        features {
          uiTests
          uiReview
          isReactNativeApp
        }
        autoAcceptChanges
        turboSnapEnabled
        wasLimited
        app {
          manageUrl
          setupUrl
          account {
            exceededThreshold
            paymentRequired
            billingUrl
          }
          repository {
            provider
          }
        }
        tests {
          spec {
            name
            component {
              name
              displayName
            }
          }
          parameters {
            viewport
            viewportIsDefault
          }
          mode {
            name
          }
        }
      }
    }
  }
`;

const SnapshotBuildQuery = `
  query SnapshotBuildQuery($number: Int!) {
    app {
      build(number: $number) {
        id
        status(legacy: false)
        autoAcceptChanges
        inProgressCount: testCount(statuses: [IN_PROGRESS])
        testCount
        changeCount
        errorCount: testCount(statuses: [BROKEN])
        completedAt
      }
    }
  }
`;

const ReportQuery = `
  query ReportQuery($buildNumber: Int!, $skip: Int, $limit: Int) {
    app {
      build(number: $buildNumber) {
        number
        status(legacy: false)
        storybookUrl
        webUrl
        createdAt
        completedAt
        tests(skip: $skip, limit: $limit) {
          status
          result
          spec {
            name
            component {
              name
              displayName
            }
          }
          parameters {
            viewport
            viewportIsDefault
          }
          mode {
            name
          }
        }
      }
    }
  }
`;

const LastBuildQuery = `
  query LastBuildQuery($commit: String!, $branch: String!) {
    app {
      isOnboarding
      lastBuild(ref: $commit, branch: $branch) {
        id
        status(legacy: false)
        storybookUrl
        webUrl
        specCount
        componentCount
        testCount
        changeCount
        errorCount: testCount(statuses: [BROKEN])
        actualTestCount: testCount(statuses: [IN_PROGRESS])
        actualCaptureCount
        inheritedCaptureCount
        interactionTestFailuresCount
      }
    }
  }
`;

const AncestorBuildsQuery = `
  query AncestorBuildsQuery($buildNumber: Int!, $skip: Int!, $limit: Int!) {
    app {
      build(number: $buildNumber) {
        ancestorBuilds(skip: $skip, limit: $limit) {
          id
          number
          commit
          uncommittedHash
          isLocalBuild
        }
      }
    }
  }
`;

const FirstCommittedAtQuery = `
  query FirstCommittedAtQuery($branch: String!, $localBuilds: LocalBuildsSpecifierInput!) {
    app {
      firstBuild(sortByCommittedAt: true, localBuilds: $localBuilds) {
        committedAt
      }
      lastBuild(branch: $branch, sortByCommittedAt: true, localBuilds: $localBuilds) {
        commit
        committedAt
      }
    }
  }
`;

const HasBuildsWithCommitsQuery = `
  query HasBuildsWithCommitsQuery($commits: [String!]!, $localBuilds: LocalBuildsSpecifierInput!) {
    app {
      hasBuildsWithCommits(commits: $commits, localBuilds: $localBuilds)
    }
  }
`;

const MergeCommitsQuery = `
  query MergeCommitsQuery($mergeInfoList: [MergedInfoInput]!) {
    app {
      mergedPullRequests(mergeInfoList: $mergeInfoList) {
        lastHeadBuild {
          commit
        }
      }
    }
  }
`;

const BaselineCommitsQuery = `
  query BaselineCommitsQuery(
    $branch: String!
    $parentCommits: [String!]!
    $localBuilds: LocalBuildsSpecifierInput!
  ) {
    app {
      baselineBuilds(branch: $branch, parentCommits: $parentCommits, localBuilds: $localBuilds) {
        id
        number
        status(legacy: false)
        commit
        committedAt
        uncommittedHash
        isLocalBuild
        changeCount
      }
    }
  }
`;

const UploadBuildMutation = `
  mutation UploadBuildMutation($buildId: ObjID!, $files: [FileUploadInput!]!, $zip: Boolean) {
    uploadBuild(buildId: $buildId, files: $files, zip: $zip) {
      info {
        sentinelUrls
        targets {
          contentType
          fileKey
          filePath
          formAction
          formFields
        }
        zipTarget {
          contentType
          fileKey
          filePath
          formAction
          formFields
        }
      }
      userErrors {
        __typename
        ... on UserError {
          message
        }
        ... on MaxFileCountExceededError {
          maxFileCount
          fileCount
        }
        ... on MaxFileSizeExceededError {
          maxFileSize
          filePaths
        }
      }
    }
  }
`;

const UploadMetadataMutation = `
  mutation UploadMetadataMutation($buildId: ObjID!, $files: [FileUploadInput!]!) {
    uploadMetadata(buildId: $buildId, files: $files) {
      info {
        targets {
          contentType
          fileKey
          filePath
          formAction
          formFields
        }
      }
      userErrors {
        ... on UserError {
          message
        }
      }
    }
  }
`;

const TrackCLITelemetryEventMutation = `
  mutation TrackCLITelemetryEvent($input: TrackCLITelemetryEventInput!) {
    trackCLITelemetryEvent(input: $input)
  }
`;

interface GraphqlAdapterDeps {
  /** Lazily resolves the GraphQL client. It is not constructed at Ports-wiring time. */
  getClient: () => GraphQLClient;
  /**
   * The CLI-token endpoint used by {@link ChromaticApi.createCliToken}. The
   * GraphQL client's default endpoint is used for every other call.
   */
  cliTokenEndpoint: string;
}

function reportTokenHeaders(options: ReportTokenCallOptions | undefined): ChromaticApiCallOptions {
  const { reportToken, ...rest } = options ?? {};
  return {
    ...rest,
    headers: reportToken ? { Authorization: `Bearer ${reportToken}` } : undefined,
  };
}

/**
 * Construct a {@link ChromaticApi} that issues GraphQL calls against the
 * Chromatic backend via the shared {@link GraphQLClient}.
 *
 * @param deps Runtime dependencies.
 * @param deps.getClient Lazy accessor for the GraphQL client.
 * @param deps.cliTokenEndpoint Endpoint for the auth-only createCliToken mutation.
 *
 * @returns A ChromaticApi that talks to the real Chromatic server.
 */
export function createGraphqlChromaticApi(deps: GraphqlAdapterDeps): ChromaticApi {
  return {
    setAuthorization(token) {
      deps.getClient().setAuthorization(token);
    },
    async createCliToken(input) {
      const { cliToken } = await deps.getClient().runQuery<{ cliToken: string }>(
        CreateCLITokenMutation,
        { projectId: input.projectId },
        {
          endpoint: deps.cliTokenEndpoint,
          headers: { Authorization: `Bearer ${input.userToken}` },
        }
      );
      return cliToken;
    },
    async createAppToken(input) {
      const { appToken } = await deps
        .getClient()
        .runQuery<{ appToken: string }>(CreateAppTokenMutation, input);
      return appToken;
    },
    async announceBuild(input) {
      const { announceBuild } = await deps
        .getClient()
        .runQuery<{ announceBuild: AnnouncedBuild }>(AnnounceBuildMutation, input, { retries: 3 });
      return announceBuild;
    },
    async skipBuild(input) {
      const result = await deps.getClient().runQuery<boolean>(SkipBuildMutation, input);
      return Boolean(result);
    },
    async publishBuild(input, options) {
      const { publishBuild } = await deps
        .getClient()
        .runQuery<{ publishBuild: PublishedBuild }>(PublishBuildMutation, input, {
          retries: 3,
          ...reportTokenHeaders(options),
        });
      return publishBuild;
    },
    async getStartedBuild(input, options) {
      const {
        app: { build },
      } = await deps.getClient().runQuery<{
        app: { build: StartedBuild };
      }>(StartedBuildQuery, input, reportTokenHeaders(options));
      return build;
    },
    async verifyBuild(input, options) {
      const {
        app: { build },
      } = await deps.getClient().runQuery<{
        app: { build: VerifiedBuild };
      }>(VerifyBuildQuery, input, reportTokenHeaders(options));
      return build;
    },
    async getSnapshotBuild(input, options) {
      const {
        app: { build },
      } = await deps.getClient().runQuery<{
        app: { build: SnapshotBuildState };
      }>(SnapshotBuildQuery, input, reportTokenHeaders(options));
      return build;
    },
    async getReport(input, options) {
      const {
        app: { build },
      } = await deps
        .getClient()
        .runQuery<{ app: { build: ReportBuild } }>(ReportQuery, input, reportTokenHeaders(options));
      return build;
    },
    async getLastBuildForCommit(input) {
      const { app } = await deps
        .getClient()
        .runQuery<{ app: LastBuildInfo }>(LastBuildQuery, input);
      return app;
    },
    async getAncestorBuilds(input) {
      const {
        app: {
          build: { ancestorBuilds },
        },
      } = await deps.getClient().runQuery<{
        app: { build: { ancestorBuilds: AncestorBuild[] } };
      }>(AncestorBuildsQuery, input);
      return ancestorBuilds;
    },
    async getFirstCommittedAt(input, options) {
      const { app } = await deps
        .getClient()
        .runQuery<{ app: FirstCommittedAt }>(FirstCommittedAtQuery, input, {
          retries: 5,
          ...options,
        });
      return app;
    },
    async hasBuildsWithCommits(input) {
      const {
        app: { hasBuildsWithCommits },
      } = await deps
        .getClient()
        .runQuery<{ app: { hasBuildsWithCommits: string[] } }>(HasBuildsWithCommitsQuery, input);
      return hasBuildsWithCommits;
    },
    async getMergedPullRequests(input, options) {
      const {
        app: { mergedPullRequests },
      } = await deps.getClient().runQuery<{
        app: { mergedPullRequests: MergedPullRequest[] };
      }>(MergeCommitsQuery, input, { retries: 5, ...options });
      return mergedPullRequests;
    },
    async getBaselineBuilds(input) {
      const {
        app: { baselineBuilds },
      } = await deps
        .getClient()
        .runQuery<{ app: { baselineBuilds: BaselineBuild[] } }>(BaselineCommitsQuery, input);
      return baselineBuilds;
    },
    async uploadBuild(input) {
      const { uploadBuild } = await deps
        .getClient()
        .runQuery<{ uploadBuild: UploadBuildResult }>(UploadBuildMutation, {
          buildId: input.buildId,
          files: input.files.map(({ contentHash, contentLength, targetPath }) => ({
            contentHash,
            contentLength,
            filePath: targetPath,
          })),
          zip: input.zip,
        });
      return uploadBuild;
    },
    async uploadMetadata(input) {
      const { uploadMetadata } = await deps
        .getClient()
        .runQuery<{ uploadMetadata: UploadMetadataResult }>(UploadMetadataMutation, {
          buildId: input.buildId,
          files: input.files.map(({ contentHash, contentLength, targetPath }) => ({
            contentHash,
            contentLength,
            filePath: targetPath,
          })),
        });
      return uploadMetadata;
    },
    async trackTelemetryEvent(input) {
      await deps.getClient().runQuery(TrackCLITelemetryEventMutation, { input }, { retries: 0 });
    },
  };
}
