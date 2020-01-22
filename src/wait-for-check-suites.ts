import * as core from '@actions/core'
import {GitHub} from '@actions/github'
import Octokit from '@octokit/rest' // imported for types only

/* eslint-disable @typescript-eslint/camelcase */
// All possible Check Suite statuses in descending order of priority
enum CheckSuiteStatus {
  queued = 'queued',
  in_progress = 'in_progress',
  completed = 'completed'
}
// All possible Check Suite conclusions in descending order of priority
export enum CheckSuiteConclusion {
  action_required = 'action_required',
  cancelled = 'cancelled',
  timed_out = 'timed_out',
  failure = 'failure',
  neutral = 'neutral',
  success = 'success'
}
/* eslint-enable @typescript-eslint/camelcase */

interface WaitForCheckSuitesOptions {
  client: GitHub
  owner: string
  repo: string
  ref: string
  ignoreOwnCheckSuite: boolean
  waitForACheckSuite: boolean
  intervalSeconds: number
  timeoutSeconds: number | null
  appSlugFilter: string | null
}
interface CheckTheCheckSuitesOptions {
  client: GitHub
  owner: string
  repo: string
  ref: string
  ignoreOwnCheckSuite: boolean
  waitForACheckSuite: boolean
  appSlugFilter: string | null
}
interface GetCheckSuitesOptions {
  client: GitHub
  owner: string
  repo: string
  ref: string
}
interface SimpleCheckSuiteMeta {
  id: number
  app: {
    slug: string
  }
  status: CheckSuiteStatus
  conclusion: CheckSuiteConclusion
}

export async function waitForCheckSuites(options: WaitForCheckSuitesOptions): Promise<CheckSuiteConclusion> {
  const {
    client,
    owner,
    repo,
    ref,
    ignoreOwnCheckSuite,
    waitForACheckSuite,
    intervalSeconds,
    timeoutSeconds,
    appSlugFilter
  } = options

  return new Promise(async resolve => {
    // Check to see if all of the check suites have already completed
    let result = await checkTheCheckSuites({
      client,
      owner,
      repo,
      ref,
      ignoreOwnCheckSuite,
      waitForACheckSuite,
      appSlugFilter
    })
    if (result === CheckSuiteConclusion.success) {
      resolve(CheckSuiteConclusion.success)
      return
    } else if (result !== CheckSuiteStatus.queued && result !== CheckSuiteStatus.in_progress) {
      resolve(result)
      return
    }

    // Is set by setTimeout after the below setInterval
    let timeoutId: NodeJS.Timeout

    // Continue to check for completion every ${intervalSeconds}
    const intervalId = setInterval(async () => {
      result = await checkTheCheckSuites({
        client,
        owner,
        repo,
        ref,
        ignoreOwnCheckSuite,
        waitForACheckSuite,
        appSlugFilter
      })
      if (result === CheckSuiteConclusion.success) {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        clearInterval(intervalId)
        resolve(CheckSuiteConclusion.success)
        return
      } else if (result !== CheckSuiteStatus.queued && result !== CheckSuiteStatus.in_progress) {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        clearInterval(intervalId)
        resolve(result)
        return
      }
    }, intervalSeconds * 1000)

    // Fail action if ${timeoutSeconds} is reached
    if (timeoutSeconds) {
      timeoutId = setTimeout(() => {
        clearInterval(intervalId)
        throw new Error(`Timeout of ${timeoutSeconds} seconds reached.`)
      }, timeoutSeconds * 1000)
    }
  })
}

async function checkTheCheckSuites(
  options: CheckTheCheckSuitesOptions
): Promise<Exclude<CheckSuiteStatus, CheckSuiteStatus.completed> | CheckSuiteConclusion> {
  const {client, owner, repo, ref, ignoreOwnCheckSuite, waitForACheckSuite, appSlugFilter} = options

  return new Promise(async resolve => {
    const checkSuitesAndMeta = await getCheckSuites({
      client,
      owner,
      repo,
      ref
    })

    if (checkSuitesAndMeta.total_count === 0 || checkSuitesAndMeta.check_suites.length === 0) {
      if (waitForACheckSuite) {
        resolve(CheckSuiteStatus.queued)
        return
      } else {
        core.info('No check suites exist for this commit.')
        resolve(CheckSuiteConclusion.success)
        return
      }
    }
    const checkSuites = appSlugFilter
      ? checkSuitesAndMeta.check_suites.filter(checkSuite => checkSuite.app.slug === appSlugFilter)
      : checkSuitesAndMeta.check_suites
    if (checkSuites.length === 0) {
      if (waitForACheckSuite) {
        core.debug(
          `No check suites with the app slug '${appSlugFilter}' exist for this commit. Waiting for one to show up.`
        )
        resolve(CheckSuiteStatus.queued)
        return
      } else {
        core.info(`No check suites with the app slug '${appSlugFilter}' exist for this commit.`)
        resolve(CheckSuiteConclusion.success)
        return
      }
    }

    // Log check suites for debugging purposes
    core.debug(JSON.stringify(checkSuites, null, 2))

    // TODO: Use ignoreOwnCheckSuite here to filter checkSuites further,
    //  for now skip one in_progress check suite status and one null check suite conclusion

    const highestPriorityCheckSuiteStatus = getHighestPriorityCheckSuiteStatus(checkSuites, ignoreOwnCheckSuite)
    if (highestPriorityCheckSuiteStatus === CheckSuiteStatus.completed) {
      const highestPriorityCheckSuiteConclusion = getHighestPriorityCheckSuiteConclusion(
        checkSuites,
        ignoreOwnCheckSuite
      )
      if (highestPriorityCheckSuiteConclusion === CheckSuiteConclusion.success) {
        resolve(CheckSuiteConclusion.success)
      } else {
        core.error('One or more check suites were unsuccessful. Below is some metadata on the check suites.')
        core.error(JSON.stringify(diagnose(checkSuites)))
        resolve(highestPriorityCheckSuiteConclusion)
      }
    } else {
      resolve(highestPriorityCheckSuiteStatus)
    }
  })
}

async function getCheckSuites(options: GetCheckSuitesOptions): Promise<Octokit.ChecksListSuitesForRefResponse> {
  const {client, owner, repo, ref} = options

  return new Promise(async resolve => {
    const result = await client.checks.listSuitesForRef({
      owner,
      repo,
      ref
    })
    if (result.status !== 200) {
      throw new Error(
        `Failed to list check suites for ${owner}/${repo}@${ref}. ` +
          `Expected response code 200, got ${result.status}.`
      )
    }
    resolve(result.data)
  })
}

function diagnose(checkSuites: Octokit.ChecksListSuitesForRefResponseCheckSuitesItem[]): SimpleCheckSuiteMeta[] {
  return checkSuites.map<SimpleCheckSuiteMeta>(
    checkSuite =>
      // eslint-disable-next-line @typescript-eslint/no-object-literal-type-assertion
      ({
        id: checkSuite.id,
        app: {
          slug: checkSuite.app.slug
        },
        status: checkSuite.status as CheckSuiteStatus,
        conclusion: checkSuite.conclusion as CheckSuiteConclusion
      } as SimpleCheckSuiteMeta)
  )
}

function getHighestPriorityCheckSuiteStatus(
  checkSuites: Octokit.ChecksListSuitesForRefResponseCheckSuitesItem[],
  ignoreOwnCheckSuite: boolean
): CheckSuiteStatus {
  let skipOneInProgress = ignoreOwnCheckSuite
  return checkSuites
    .map(checkSuite => CheckSuiteStatus[checkSuite.status as keyof typeof CheckSuiteStatus])
    .reduce((previous, current, currentIndex) => {
      if (skipOneInProgress && current === CheckSuiteStatus.in_progress) {
        skipOneInProgress = false
        return previous
      }
      for (const status of Object.keys(CheckSuiteStatus)) {
        if (current === undefined) {
          throw new Error(
            `Check suite status '${checkSuites[currentIndex].status}' ('${
              CheckSuiteStatus[checkSuites[currentIndex].status as keyof typeof CheckSuiteStatus]
            }') can't be mapped to one of the CheckSuiteStatus enum's keys. ` +
              "Please submit an issue on this action's GitHub repo."
          )
        }
        if (previous === status) {
          return previous
        } else if (current === status) {
          return current
        }
      }
      return current
    }, CheckSuiteStatus.completed)
}

function getHighestPriorityCheckSuiteConclusion(
  checkSuites: Octokit.ChecksListSuitesForRefResponseCheckSuitesItem[],
  ignoreOwnCheckSuite: boolean
): CheckSuiteConclusion {
  let skipOneUndefined = ignoreOwnCheckSuite
  return checkSuites
    .map(checkSuite => CheckSuiteConclusion[checkSuite.conclusion as keyof typeof CheckSuiteConclusion])
    .reduce((previous, current, currentIndex) => {
      if (skipOneUndefined && current === undefined) {
        skipOneUndefined = false
        return previous
      }
      for (const conclusion of Object.keys(CheckSuiteConclusion)) {
        if (current === undefined) {
          throw new Error(
            `Check suite conclusion '${checkSuites[currentIndex].conclusion}' ('${
              CheckSuiteConclusion[checkSuites[currentIndex].conclusion as keyof typeof CheckSuiteConclusion]
            }') can't be mapped to one of the CheckSuiteConclusion enum's keys. ` +
              "Please submit an issue on this action's GitHub repo."
          )
        }
        if (previous === conclusion) {
          return previous
        } else if (current === conclusion) {
          return current
        }
      }
      return current
    }, CheckSuiteConclusion.success)
}
