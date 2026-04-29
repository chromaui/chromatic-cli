import { Context } from '../../types';

const ConfirmShareMutation = `
  mutation ConfirmShare($shareId: ID!, $status: ShareStatus!) {
    confirmShare(shareId: $shareId, status: $status) {
      status
    }
  }
`;

interface ConfirmShareResult {
  confirmShare: {
    status: string;
  };
}

export type ConfirmShareStatus = 'complete' | 'error' | 'cancelled';

/**
 * Report the final status of a share upload to the backend.
 *
 * @param ctx The task context, used for the GraphQL client and user token.
 * @param status The terminal status of the share upload.
 *
 * @returns The status echoed by the backend.
 */
export async function confirmShare(ctx: Context, status: ConfirmShareStatus) {
  if (!ctx.share?.shareId) {
    throw new Error('Missing share ID in context');
  }

  const { confirmShare: result } = await ctx.client.runQuery<ConfirmShareResult>(
    ConfirmShareMutation,
    { shareId: ctx.share.shareId, status },
    {
      endpoint: `${ctx.env.CHROMATIC_INDEX_URL}/api`,
      headers: { Authorization: `Bearer ${ctx.options.userToken}` },
    }
  );
  return result;
}
