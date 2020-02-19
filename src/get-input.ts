import * as core from '@actions/core'
import {context, GitHub} from '@actions/github'
import {parseBoolean} from './parse-boolean'

interface Inputs {
  client: GitHub
  owner: string
  repo: string
  ref: string
  checkSuiteID: number | null
  waitForACheckSuite: boolean
  intervalSeconds: number
  timeoutSeconds: number | null
  failStepIfUnsuccessful: boolean
  appSlugFilter: string | null
  onlyFirstCheckSuite: boolean
}

export async function getInput(): Promise<Inputs> {
  core.debug(
    JSON.stringify({repository: `${context.repo.owner}/${context.repo.repo}`, ref: context.ref, sha: context.sha})
  )

  // Create GitHub client
  const client = new GitHub(core.getInput('token', {required: true}))

  // Convert the repository input (`${owner}/${repo}`) into two inputs, owner and repo
  const repository = core.getInput('repository', {required: true})
  const splitRepository = repository.split('/')
  if (splitRepository.length !== 2 || !splitRepository[0] || !splitRepository[1]) {
    throw new Error(`Invalid repository '${repository}'. Expected format {owner}/{repo}.`)
  }
  const owner = splitRepository[0]
  const repo = splitRepository[1]

  // Get the git commit's ref now so it's not pulled multiple times
  const ref = core.getInput('ref', {required: true})

  // checkSuiteID is the ID of this Check Run's Check Suite
  // if repository is different from this Check Run's repository, then checkSuiteID is null
  if (!process.env.GITHUB_RUN_ID) {
    throw new Error(
      `Expected the environment variable $GITHUB_RUN_ID to be set to a truthy value, but it isn't (${
        process.env.GITHUB_RUN_ID
      } as ${typeof process.env.GITHUB_RUN_ID}). Please submit an issue on this action's GitHub repo.`
    )
  }
  /* eslint-disable @typescript-eslint/camelcase */
  let checkSuiteID: number | null = null
  if (owner === context.repo.owner && repo === context.repo.repo) {
    const workflowRunID = parseInt(process.env.GITHUB_RUN_ID)
    const response = await client.actions.getWorkflowRun({owner, repo, run_id: workflowRunID})
    if (response.status !== 200) {
      throw new Error(
        `Failed to get workflow run from ${owner}/${repo} with workflow run ID ${workflowRunID}. ` +
          `Expected response code 200, got ${response.status}.`
      )
    }
    // short-term workaround until @actions/github and @octokit/rest are updated to match actual responses
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const checkSuiteIDString: string | undefined = ((response.data as any).check_suite_url as string).split('/').pop()
    if (!checkSuiteIDString) {
      throw new Error(
        `Expected the check_suite_url property to be returned in the getWorkflowRun API call, but it isn't (${
          (response.data as any).check_suite_url
        } as ${typeof (response.data as any).check_suite_url}). Please submit an issue on this action's GitHub repo.`
      )
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    checkSuiteID = parseInt(checkSuiteIDString)
  }
  /* eslint-enable @typescript-eslint/camelcase */
  if (checkSuiteID !== null && isNaN(checkSuiteID)) {
    throw new Error(
      `Expected the environment variable $GITHUB_RUN_ID to be a number but it isn't (${checkSuiteID} as ${typeof checkSuiteID}). ` +
        "Please submit an issue on this action's GitHub repo."
    )
  }

  // Default the timeout to null
  const timeoutSecondsInput = core.getInput('timeoutSeconds')
  let timeoutSeconds: number | null =
    timeoutSecondsInput && timeoutSecondsInput.length > 0 ? parseInt(timeoutSecondsInput) : null
  if (timeoutSeconds && timeoutSeconds <= 0) {
    timeoutSeconds = null
  }

  // Default the check suites filter to null
  let appSlugFilter: string | null = core.getInput('appSlugFilter')
  appSlugFilter = appSlugFilter && appSlugFilter.length > 0 ? appSlugFilter : null

  return {
    client,
    owner,
    repo,
    ref,
    waitForACheckSuite: parseBoolean(core.getInput('waitForACheckSuite', {required: true})),
    checkSuiteID,
    intervalSeconds: parseInt(core.getInput('intervalSeconds', {required: true})),
    timeoutSeconds,
    failStepIfUnsuccessful: parseBoolean(core.getInput('failStepIfUnsuccessful', {required: true})),
    appSlugFilter,
    onlyFirstCheckSuite: parseBoolean(core.getInput('onlyFirstCheckSuite', {required: true}))
  }
}
