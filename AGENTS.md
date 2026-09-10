# Repository Guidelines

## Scope and working approach

- Read `README.md` and relevant source before changing behavior.
- Check the working tree first. Preserve unrelated changes and keep patches focused
  on the requested task. Do not perform broad cleanup.
- Write public documentation, code comments, and contribution descriptions in
  English. Keep localized UI messages in the locale catalogs; preserve intentional
  multilingual extraction data and output labels.
- Before destructive or irreversible actions, explain the exact targets and obtain
  confirmation. Do not treat a request to edit files as permission to publish them.

## Source organization and style

- `src/content/` handles page extraction; `src/content/configs/` contains
  platform-specific selectors and behavior.
- `src/shared/` contains shared formatting and utilities; `src/background/` handles
  extension coordination; `src/popup/` contains the popup UI.
- `_locales/` contains translations, and `src/assets/` contains static assets.
- Put localized UI messages in `_locales/<locale>/messages.json` and ensure the
  default locale provides a fallback for every message key.
- Follow the surrounding JavaScript style, including two-space indentation and
  existing module or global conventions. Prefer platform-local fixes before
  changing shared extraction or formatting behavior.
- Avoid new permissions, dependencies, and unrelated formatting changes unless
  required by the task. Explain any permission or dependency changes.

## Discovering build and validation workflows

- Inspect the current manifest, available configuration, scripts, and documentation
  before choosing commands. Do not assume a package manager, bundler, test runner,
  output directory, or fixed build step exists.
- Select the smallest useful checks for the affected behavior using available
  tooling. Explain what they verify and which behavior remains unverified.
- Do not introduce a build pipeline merely because one is absent. When packaging
  is requested, discover the current release workflow and inspect the resulting
  archive contents rather than assuming that Git ignore rules control packaging.
- Report the checks actually run, their results, and any unverified behavior.
  Never present skipped checks as passing or local checks as proof of live behavior.

## Verification principles

- Reproduce reported failures through the affected user workflow and verify the
  fix through that same workflow.
- Preserve existing behavior unless the user requests a behavior change. Do not
  replace a failing path with a different feature or weaken acceptance criteria
  merely to obtain a passing result.
- Use evidence appropriate to the change, and distinguish confirmed results from
  assumptions and unverified behavior.

## Private data and release boundaries

- Private conversations, shared conversation URLs, raw DOM captures, actual-output
  files, reference transcripts, session data, and generated archives must stay out
  of public commits, issues, screenshots, and diagnostic logs.
- Respect `.gitignore` and local exclusions. Never force-add private test folders or
  generated build output to make a workflow available to others.
- Before preparing a commit or release, inspect the included files. Ignore rules
  neither untrack files already in Git nor automatically exclude files from ZIPs.
- Public examples and any public fixtures must be synthetic or explicitly approved
  for publication. Use summaries that do not disclose conversation content.

## Commits and pull requests

- Use Conventional Commits with an English subject under 50 characters, such as
  `fix(chatgpt): preserve uploaded images`.
- Describe the concrete problem and resulting behavior. Identify affected platforms,
  checks performed, and material verification limits.
- Keep descriptions scoped to the included changes. Include screenshots only when
  they help review UI changes, and ensure they contain no private conversation data.
