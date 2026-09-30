# ChatGPT plugin publication draft

This directory holds the review package for the first public JLPT Master Deck plugin release. It is a **draft**, not a submitted or approved listing. The release covers the AI learning home, saved review-card ratings, personalized practice, and learning history. Workstation news cycles, local official samples, local mock exams, backup export, and local audio analysis are excluded from the hosted MCP catalog.

## Package

- `plugin/jlpt-master-deck/plugin.json`: portable Agent Plugins manifest and OpenAI listing/review metadata.
- `plugin/jlpt-master-deck/mcp.json`: hosted HTTPS MCP endpoint.
- `plugin/jlpt-master-deck/assets/`: square icons derived from the existing project logo.
- `plugin/jlpt-master-deck/.codex-plugin/plugin.json`: compatibility manifest. The root `plugin.json` is canonical.
- `jlpt-master-deck-draft.zip`: generated from the package folder. Rebuild it after editing any package file.
- `review-plan.md`: reviewer data, test, and demo plan. Keep reviewer credentials outside this repository and ZIP.

## Before submitting

1. Replace `Publisher name pending` with the verified personal publisher name. The dashboard identity and listing must agree.
2. Add a private support contact to the website support page and finalize the privacy policy and terms. Confirm data retention, deletion, provider details, and the correct publisher identity before removing the draft labels. Then deploy the three pages and verify their public HTTPS URLs.
3. Deploy and rescan the hosted MCP. Verify that news, mock exam, official sample, backup export, and workstation audio tools are absent from its authenticated `tools/list` result. Local MCP can keep those tools.
4. Create the plugin draft in the OpenAI portal. Serve its exact domain challenge token at `/.well-known/openai-apps-challenge` on the eligible HTTPS origin. The token is provided by the portal and must not be guessed or committed here.
5. Create a dedicated reviewer account with sample study data and a usable sign-in method, then run all five positive and three negative cases in ChatGPT. Enter its credentials privately in the portal.
6. Record a reviewer-accessible walkthrough of those cases and set `review.demo_recording_url` in the manifest or provide it in the portal. Rebuild the ZIP and inspect automated findings before submission.

The current live endpoint and website may still run older code until deployed. A successful local build, ZIP validation, or package upload does not prove the hosted MCP is updated or that OpenAI has approved publication.

References: [OpenAI package format](https://developers.openai.com/plugins/build/plugins), [submission process](https://developers.openai.com/plugins/deploy/submission).
