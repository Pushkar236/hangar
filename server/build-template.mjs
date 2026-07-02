// Build the "hangar-claude-code" E2B template with Claude Code preinstalled,
// so fresh sandboxes skip the ~10-30s npm install. Run:
//   node --env-file=.env build-template.mjs
import { Template } from "e2b";

const template = Template()
  .fromNodeImage("22")
  .runCmd(
    "apt-get update && apt-get install -y --no-install-recommends git ca-certificates curl ripgrep && rm -rf /var/lib/apt/lists/*",
    { user: "root" },
  )
  .runCmd("npm install -g @anthropic-ai/claude-code@latest", { user: "root" });

console.log("Building template hangar-claude-code …");
const res = await Template.build(template, "hangar-claude-code", {
  cpuCount: 2,
  memoryMB: 2048,
});
console.log("Built:", JSON.stringify(res));
