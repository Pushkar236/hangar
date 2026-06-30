# E2B sandbox template for Hangar: Node + Claude Code preinstalled.
# Build & publish with:
#   cd sandbox && e2b template build --name hangar-claude-code --dockerfile e2b.Dockerfile
# Then set E2B_TEMPLATE=hangar-claude-code on the orchestrator.
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates curl ripgrep \
  && rm -rf /var/lib/apt/lists/*

# Claude Code CLI — available globally as `claude`.
RUN npm install -g @anthropic-ai/claude-code

ENV TERM=xterm-256color
# E2B's default sandbox user is `user` with home /home/user.
WORKDIR /home/user
