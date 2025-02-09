# Contributing to Plane Sync

We love your input! We want to make contributing to Plane Sync as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## Development Setup

1. Fork and clone the repository
```bash
git clone https://github.com/your-username/plane-sync.git
cd plane-sync
```

2. Install dependencies
```bash
npm install
```

3. Create a `.env` file with required environment variables
```bash
GITHUB_TOKEN=your_github_token
PLANE_API_KEY=your_plane_api_key
```

4. Build the project
```bash
npm run build
```

5. Run tests
```bash
npm test
```

## Code Style

- We use TypeScript for type safety
- Follow the existing code style
- Use meaningful variable and function names
- Add comments for complex logic
- Include TypeScript types for all functions and variables
- Run `npm run build` to ensure no type errors

## Testing

- Write tests for new features
- Update tests when modifying existing features
- Ensure all tests pass before submitting a PR
- Include both unit tests and integration tests where appropriate

## We Develop with Github
We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

## We Use [Github Flow](https://guides.github.com/introduction/flow/index.html)
Pull requests are the best way to propose changes to the codebase. We actively welcome your pull requests:

1. Fork the repo and create your branch from `main`.
2. If you've added code that should be tested, add tests.
3. If you've changed APIs, update the documentation.
4. Ensure the test suite passes.
5. Make sure your code lints.
6. Issue that pull request!

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. This means commit messages should be formatted as:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Types include:
- feat: A new feature
- fix: A bug fix
- docs: Documentation changes
- style: Code style changes (formatting, missing semi colons, etc)
- refactor: Code changes that neither fixes a bug nor adds a feature
- test: Adding missing tests or correcting existing tests
- chore: Changes to the build process or auxiliary tools
- ci: Changes to CI configuration files and scripts
- build: Changes that affect the build system or external dependencies
- revert: Reverts a previous commit

The repository is configured with commitlint and husky to automatically enforce these conventions. Your commit will be rejected if it doesn't follow the correct format.

Examples of valid commit messages:
```
feat: add automatic state mapping between GitHub and Plane
fix(sync): resolve issue with duplicate issue creation
docs: update API documentation with new endpoints
style: format code according to prettier rules
```

## Any contributions you make will be under the MIT Software License
In short, when you submit code changes, your submissions are understood to be under the same [MIT License](http://choosealicense.com/licenses/mit/) that covers the project. Feel free to contact the maintainers if that's a concern.

## Report bugs using Github's [issue tracker](https://github.com/squirrelogic/plane-sync/issues)
We use GitHub issues to track public bugs. Report a bug by [opening a new issue](https://github.com/squirrelogic/plane-sync/issues/new); it's that easy!

## Write bug reports with detail, background, and sample code

**Great Bug Reports** tend to have:

- A quick summary and/or background
- Steps to reproduce
  - Be specific!
  - Give sample code if you can.
- What you expected would happen
- What actually happens
- Notes (possibly including why you think this might be happening, or stuff you tried that didn't work)

## Pull Request Process

1. Create a new branch from `main` using a descriptive name:
   ```bash
   git checkout -b feat/add-new-feature
   # or
   git checkout -b fix/issue-123
   ```

2. Make your changes following our code style guidelines.

3. Write clear, conventional commit messages:
   ```bash
   # For new features
   git commit -m "feat: add automatic state mapping"

   # For bug fixes
   git commit -m "fix: resolve duplicate issue creation"

   # For breaking changes
   git commit -m "feat!: change API endpoint structure

   BREAKING CHANGE: The API endpoint structure has changed..."
   ```

4. Update documentation:
   - Add/modify JSDoc comments for new/changed functions
   - Update README.md if adding new features or changing functionality
   - Update configuration examples if changing configuration options

5. Add or update tests:
   - Write unit tests for new functionality
   - Update existing tests if changing behavior
   - Ensure all tests pass with `npm test`

6. Before submitting:
   - Run `npm run build` to check for TypeScript errors
   - Ensure your branch is up to date with main
   - Squash commits if necessary to maintain a clean history
   - Review the diff to ensure no unintended changes

7. Create the Pull Request:
   - Use a clear, descriptive title following conventional commit format
   - Fill out the PR template completely
   - Link any related issues using GitHub keywords (Fixes #123)
   - Request review from maintainers

8. Address review feedback:
   - Make requested changes
   - Push updates to the same branch
   - Re-request review if needed

9. After approval:
   - Maintainers will handle the version bump and changelog update
   - Your PR will be merged using squash and merge
   - The branch will be deleted after successful merge

Note: Version numbers and CHANGELOG.md are managed by maintainers using our release process. You don't need to update these files manually in your PR.

## License
By contributing, you agree that your contributions will be licensed under its MIT License.

## Versioning and Changelog

We use [Semantic Versioning](https://semver.org/) for version numbers. This means:
- MAJOR version for incompatible API changes (1.0.0)
- MINOR version for backwards-compatible functionality additions (0.1.0)
- PATCH version for backwards-compatible bug fixes (0.0.1)

The changelog is automatically generated from conventional commit messages when creating a new release. To create a new release:

1. For a patch release (bug fixes):
```bash
npm run release:patch
```

2. For a minor release (new features):
```bash
npm run release:minor
```

3. For a major release (breaking changes):
```bash
npm run release:major
```

These commands will:
1. Update the version in package.json
2. Generate/update CHANGELOG.md based on commits
3. Create a git tag
4. Create a commit with these changes

The changelog categorizes changes based on commit types:
- `feat:` commits are listed under "Features"
- `fix:` commits are listed under "Bug Fixes"
- `perf:` commits are listed under "Performance Improvements"
- Breaking changes (commits with `BREAKING CHANGE:` in body) are listed under "BREAKING CHANGES"
