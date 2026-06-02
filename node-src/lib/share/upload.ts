import { Context } from '../../types';

const UploadShareMutation = `
  mutation UploadShareMutation {
    uploadStorybookShare {
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
  uploadStorybookShare: {
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
export async function reserveShare(ctx: Context) {
  const { uploadStorybookShare: result } = await ctx.client.runQuery<UploadShareResult>(
    UploadShareMutation,
    {},
    {
      endpoint: `${ctx.env.CHROMATIC_INDEX_URL}/api`,
      headers: { Authorization: `Bearer ${ctx.options.userToken}` },
    }
  );
  return result;
}
