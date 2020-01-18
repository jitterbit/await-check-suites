import * as core from '@actions/core'
import {context} from '@actions/github'
import {parseBoolean} from './parseBoolean'

interface Inputs {
  owner: string
  repo: string
  ref: string
  token: string
  ignoreOwnCheckSuite: boolean
  waitForACheckSuite: boolean
  intervalSeconds: number
  timeoutSeconds: number | null
  failStepOnFailure: boolean
  appSlugFilter: string | null
}

export function getInput(): Inputs {
  // Convert the repository input (`${owner}/${repo}`) into two inputs, owner and repo
  const repository = core.getInput('repository') || `${context.repo.owner}/${context.repo.repo}`
  const splitRepository = repository.split('/')
  if (splitRepository.length !== 2 || !splitRepository[0] || !splitRepository[1]) {
    throw new Error(`Invalid repository '${repository}'. Expected format {owner}/{repo}.`)
  }

  // Get the git commit's ref now so it's not pulled multiple times
  const ref = core.getInput('ref') || context.sha

  // ignoreOwnCheckSuite should only be true if repository and ref reference the same commit of the current check run
  let ignoreOwnCheckSuite = parseBoolean(core.getInput('ignoreOwnCheckSuite'))
  if (
    ignoreOwnCheckSuite &&
    (repository !== `${context.repo.owner}/${context.repo.repo}` || ref !== context.sha)
  ) {
    ignoreOwnCheckSuite = false
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
    owner: splitRepository[0],
    repo: splitRepository[1],
    ref,
    token: core.getInput('token', {required: true}),
    waitForACheckSuite: parseBoolean(core.getInput('waitForACheckSuite')),
    ignoreOwnCheckSuite,
    intervalSeconds: parseInt(core.getInput('intervalSeconds')),
    timeoutSeconds,
    failStepOnFailure: parseBoolean(core.getInput('failStepOnFailure')),
    appSlugFilter
  }
}
