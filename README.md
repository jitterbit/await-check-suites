<p align="center">
  <a href="https://github.com/jitterbit/await-check-suites-action/actions"><img alt="jitterbit/await-check-suites-action status" src="https://github.com/jitterbit/await-check-suites-action/workflows/Test/badge.svg"></a>
</p>

# Await Check Suites Action

Wait for a commit's check suites to complete.

# Usage

See [action.yml](action.yml)

```yaml
- uses: jitterbit/await-check-suites-action@v1
  with:
    # The commit's repository name with owner.
    # For example, jitterbit/await-check-suites-action.
    # Default: ${{ github.repository }}
    repository: ''

    # The commit's ref (can be a SHA, branch name, or a tag name).
    # Default: ${{ github.sha }}
    ref: ''

    # GitHub token for GitHub API requests.
    # When `repository` is modified, set to a personal access token with access to `repository`.
    # Default: ${{ github.token }}
    token: ''

    # If `repository` and `ref` reference the commit of the current check run (true by default),
    # then ignore the check suite for this workflow.
    # Default: true
    ignoreOwnCheckSuite: ''

    # Wait for a check suite to be created if none exist.
    # This is important to protect against race conditions
    # if you know a check suite should exist on the `ref`'s commit.
    # Default: true
    waitForACheckSuite: ''

    # Number of seconds to wait between checks.
    # Default: 15
    intervalSeconds: ''

    # Number of seconds to wait before timing out.
    timeoutSeconds: ''

    # Fail step if any of the check suites complete with a conclusion other than 'success'.
    # Default: true
    failStepOnFailure: ''

    # Filter check suites for a particular app's slug (e.g., 'github-actions').
    appSlugFilter: ''
```

# Scenarios

- [Wait for other check suites on this commit to complete](#Wait-for-other-check-suites-on-this-commit-to-complete)
- [Wait for all check suites on a commit in another repo to complete](#Wait-for-all-check-suites-on-a-commit-in-another-repo-to-complete)

## Wait for other check suites on this commit to complete

```yaml
- uses: jitterbit/await-check-suites-action@v1
```

## Wait for all check suites on a commit in another repo to complete

```yaml
- uses: jitterbit/await-check-suites-action@v1
  with:
    repository: jitterbit/git-ops
    ref: ${{ env.git_ops_commit_sha }}
    token: ${{ secrets.GITHUB_PAT }}
```

# Install, Build, Lint, Test, and Package

Make sure to do the following before checking in any code changes.

```bash
$ yarn
$ yarn all
```

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
