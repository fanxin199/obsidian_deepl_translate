# GitHub releases and cloud networking

## Automatic releases

`.github/workflows/release.yml` tests every push to `main` and pull request. A version tag runs the tests and then builds and publishes a GitHub Release with `main.js`, `manifest.json`, `styles.css`, a ZIP, and SHA-256 checksums. GitHub-hosted runners use their short-lived `GITHUB_TOKEN`; no personal token is committed or needed for this workflow.

Before a new release, update `manifest.json`, `package.json`, the root/package versions in `package-lock.json`, and `versions.json`. Add matching release notes at `.github/release-notes/<version>.md`, then run `npm run typecheck`, `npm test`, and `npm run test:mobile` (Chrome/Chromium required) and commit the changes. Push the commit to `main`, then push a tag whose name exactly matches the version (for example `1.2.0`, without a `v` prefix).

The workflow requires GitHub Actions to be enabled in the repository. Its release job requests `contents: write`. Organization/repository policies must permit the pinned official `actions/checkout` and `actions/setup-node` actions and the requested token permission. Check failed runs in the repository's Actions tab; a pushed tag alone does not confirm publication.

If a pushed tag does not create a workflow run (as observed with the cloud Git proxy during the initial 1.2.0 push), use Actions -> Test and release -> Run workflow on `main`, supplying the existing version tag. This runs tests and builds from the tag rather than from the current branch. The CLI equivalent is `gh workflow run release.yml --repo fanxin199/obsidian_deepl_translate --ref main -f version=1.2.0`. Check the run and the release attachments afterwards; this is a publishing action, not a read-only check.

## Permanently allow direct publishing from Codex cloud / 彻底解决云环境发布 API 拦截

The observed `CONNECT tunnel failed, response 403` with `server: envoy` occurred before GitHub processed the API request. This is a cloud egress allowlist problem, distinct from GitHub repository permissions. Allowing only `github.com` or the package-manager preset does not allow all GitHub API hostnames.

1. Open this cloud environment's settings and its network/Internet-access configuration. Keep the existing package-manager preset and all existing custom allowed domains.
2. Add **`api.github.com`** (release creation/status and GitHub API) and **`uploads.github.com`** (release attachment uploads). Keep **`github.com`** and **`release-assets.githubusercontent.com`** allowed for repository operations and release downloads; the environment's existing preset already includes them.
3. Save the environment settings and **publish the environment** so the configuration persists for future tasks. The agent's saved draft is not a live policy update or publication.
4. Reconnect/restart the task using the published environment if the current task has not received the network update. Environments used by other tasks need the same settings; this publication does not migrate unrelated tasks.
5. Verify in that environment with `gh api repos/fanxin199/obsidian_deepl_translate --jq .full_name` and `gh release list --repo fanxin199/obsidian_deepl_translate`. The expected repository name proves the GitHub API is reachable and authenticated. An upload is verified only after a real release attachment succeeds.

If the proxy still rejects the CONNECT request, the new policy is not active on that task, or an organization-level egress policy also blocks those hosts. Ask the environment administrator to allow those exact HTTPS hostnames. Do not disable TLS verification or bypass the proxy.

If the proxy error disappears but GitHub returns `401`, `403`, or `404`, check the connected GitHub identity and the repository's write permission separately. Use existing platform authentication first. A fine-grained token, if independently required, needs access only to this repository with Contents read/write; enter it securely in environment settings with the proper API/upload destination bindings, never in chat or source. GitHub Actions has its own built-in token, so the automatic release workflow does not depend on this cloud machine reaching the API.

上述配置可消除本次已确认的网络白名单拦截。GitHub 自身的权限、组织策略及服务故障仍是独立条件，不能仅凭保存草稿保证发布成功。
