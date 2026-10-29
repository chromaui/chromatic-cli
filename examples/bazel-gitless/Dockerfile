# syntax=docker/dockerfile:1

FROM node:22.22.3-bookworm-slim AS builder

ARG BAZELISK_VERSION=1.28.1

RUN npm install --global "@bazel/bazelisk@${BAZELISK_VERSION}"
RUN corepack enable

ENV REQUIRE_GITLESS=1

WORKDIR /workspace
COPY --chown=node:node . .

# Fail the image build if the security boundary regresses.
RUN test ! -e .git
RUN ! command -v git
RUN mkdir /out
RUN chown node:node /out

USER node
RUN yarn install --immutable --mode=skip-build

WORKDIR /workspace/examples/bazel-gitless
RUN bazel run //:storybook -- /out

RUN node verify-storybook.cjs /out
RUN test ! -e /workspace/.git
RUN ! command -v git

# `docker buildx --output` exports only the static Storybook, not the build image.
FROM scratch AS artifact
COPY --from=builder /out/ /
