import { Context } from '../../types';

const UploadShareMutation = `
  mutation UploadShareMutation {
    uploadShare {
      shareId
      shareUrl
      target {
        formAction
        formFields
        keyPrefix
      }
    }
  }
`;

interface UploadShareResult {
  uploadShare: {
    shareId: string;
    shareUrl: string;
    target: {
      formAction: string;
      formFields: Record<string, string>;
      keyPrefix: string;
    };
  };
}

/**
 * Reserve a share upload slot and obtain S3 presigned POST credentials.
 *
 * @param ctx The task context, used for the GraphQL client and user token.
 *
 * @returns Details about the share such as the URL and S3 upload credentials.
 */
export async function reserveShareOnAPI(ctx: Context) {
  const { uploadShare: result } = await ctx.client.runQuery<UploadShareResult>(
    UploadShareMutation,
    {},
    {
      endpoint: `${ctx.env.CHROMATIC_INDEX_URL}/api`,
      headers: { Authorization: `Bearer ${ctx.options.userToken}` },
    }
  );
  return result;
}
