export const TesterCreateAppTokenMutation = `
  mutation TesterCreateAppTokenMutation($appCode: String!) {
    createAppToken(code: $appCode)
  }
`;

export const TesterCreateBuildMutation = `
  mutation TesterCreateBuildMutation($input: CreateBuildInput!, $isolatorUrl: String!) {
    createBuild(input: $input, isolatorUrl: $isolatorUrl) {
      id
      number
      specCount
      snapshotCount
      componentCount
      webUrl
      app {
        account {
          features { 
            diffs
          }
        }
      }
    }
  }
`;

export const TesterSkipBuildMutation = `
  mutation TesterSkipBuildMutation($appId: ObjID, $commit: String!) {
    skipBuild(appId: $appId, commit: $commit)
  }
`;

export const TesterBuildQuery = `
  query TesterBuildQuery($buildNumber: Int!) {
    app {
      build(number: $buildNumber) {
        id
        status
        autoAcceptChanges
        inProgressCount: snapshotCount(statuses: [SNAPSHOT_IN_PROGRESS])
        snapshotCount
        changeCount
        errorCount: snapshotCount(statuses: [SNAPSHOT_CAPTURE_ERROR])
      }
    }
  }
`;
