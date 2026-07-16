# Contributing to Zyn

Thank you for your interest in contributing to Zyn. We welcome improvements, bug fixes, documentation updates, and new ideas that help make the project better.

## Before You Start

Please take a few minutes to:

- Read the repository `README.md`
- Review `AGENTS.md` if present
- Check existing issues and pull requests to avoid duplicate work
- Understand the project structure, especially the provider, plugin, and MCP-related folders

## What We Accept

We welcome contributions such as:

- Bug fixes
- Performance improvements
- Documentation updates
- Tests and quality improvements
- New providers, plugins, or MCP integrations
- Better error handling and developer experience improvements

## How to Contribute

1. Fork the repository.
2. Create a new branch for your work.
3. Make focused changes.
4. Run the relevant checks and tests.
5. Open a pull request with a clear description.

Example branch names:

- `fix/provider-timeout`
- `feat/plugin-loader`
- `docs/update-readme`
- `refactor/session-store`

## Code Style

Please follow the existing style of the project:

- Keep changes small and readable
- Match surrounding conventions
- Prefer clear naming over clever shortcuts
- Avoid unnecessary dependencies
- Do not break backward compatibility unless the change is intentional and documented

If the project already uses formatters or linters, run them before submitting your changes.

## Providers, Plugins, and MCP

When contributing to these parts of the project:

- Reuse existing abstractions whenever possible
- Keep interfaces consistent
- Validate input carefully
- Handle failures gracefully
- Avoid exposing secrets or internal tokens
- Add or update documentation when behavior changes

For new plugin or MCP features, include:

- A clear purpose
- Configuration examples
- Error handling behavior
- Any required environment variables or permissions
- Verification steps or usage examples

## Testing

Before opening a pull request, make sure your change is tested.

At minimum:

- Run unit tests if available
- Test the specific feature you changed
- Verify that the project still starts correctly
- Check for regressions in related flows

If you cannot run a test suite, explain why in the pull request and describe how the change was validated.

## Pull Request Guidelines

A good pull request should:

- Have a clear title
- Explain what changed and why
- Reference related issues when applicable
- Include screenshots or logs if relevant
- Mention any breaking changes
- Keep the scope focused

## Documentation

If your change affects users or contributors, update the documentation as part of the same pull request.

This may include:

- `README.md`
- `AGENTS.md`
- `SUPPORT.md`
- API docs
- Examples
- Changelog or release notes

## Getting Help

If you are unsure about how to contribute, open an issue or use the support channels in `SUPPORT.md`.

We appreciate every contribution that helps improve Zyn.
