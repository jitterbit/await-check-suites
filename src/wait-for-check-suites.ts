import * as core from '@actions/core'
import {GitHub} from '@actions/github'
import Octokit from '@octokit/rest' // imported for types only

// Define these enums to workaround https://github.com/octokit/plugin-rest-endpoint-methods.js/issues/9
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
  checkSuiteID: number | null
  waitForACheckSuite: boolean
  intervalSeconds: number
  timeoutSeconds: number | null
  appSlugFilter: string | null
  onlyFirstCheckSuite: boolean
}
interface CheckTheCheckSuitesOptions {
  client: GitHub
  owner: string
  repo: string
  ref: string
  checkSuiteID: number | null
  waitForACheckSuite: boolean
  appSlugFilter: string | null
  onlyFirstCheckSuite: boolean
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
    checkSuiteID,
    waitForACheckSuite,
    intervalSeconds,
    timeoutSeconds,
    appSlugFilter,
    onlyFirstCheckSuite
  } = options

  return new Promise(async resolve => {
    // Check to see if all of the check suites have already completed
    let response = await checkTheCheckSuites({
      client,
      owner,
      repo,
      ref,
      checkSuiteID,
      waitForACheckSuite,
      appSlugFilter,
      onlyFirstCheckSuite
    })
    if (response === CheckSuiteConclusion.success) {
      resolve(CheckSuiteConclusion.success)
      return
    } else if (response !== CheckSuiteStatus.queued && response !== CheckSuiteStatus.in_progress) {
      resolve(response)
      return
    }

    // Is set by setTimeout after the below setInterval
    let timeoutId: NodeJS.Timeout

    // Continue to check for completion every ${intervalSeconds}
    const intervalId = setInterval(async () => {
      response = await checkTheCheckSuites({
        client,
        owner,
        repo,
        ref,
        checkSuiteID,
        waitForACheckSuite,
        appSlugFilter,
        onlyFirstCheckSuite
      })
      if (response === CheckSuiteConclusion.success) {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        clearInterval(intervalId)
        resolve(CheckSuiteConclusion.success)
        return
      } else if (response !== CheckSuiteStatus.queued && response !== CheckSuiteStatus.in_progress) {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        clearInterval(intervalId)
        resolve(response)
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
  const {client, owner, repo, ref, checkSuiteID, waitForACheckSuite, appSlugFilter, onlyFirstCheckSuite} = options

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
    let checkSuites = appSlugFilter
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

    // Only take into account the first Check Suite created that matches the `appSlugFilter`
    if (onlyFirstCheckSuite) {
      // Get the first Check Suite created by reducing the array based on the created_at timestamp
      const firstCheckSuite = checkSuites.reduce((previous, current) => {
        // Cast to any to workaround https://github.com/octokit/plugin-rest-endpoint-methods.js/issues/8
        /* eslint-disable @typescript-eslint/no-explicit-any */
        const previousDateString = (previous as any)['created_at'],
          currentDateString = (current as any)['created_at']
        /* eslint-enable @typescript-eslint/no-explicit-any */
        if (typeof previousDateString !== 'string' || typeof currentDateString !== 'string') {
          throw new Error(
            `Expected ChecksListSuitesForRefResponseCheckSuitesItem to have the property 'created_at' with type 'string' but got '${
              typeof previousDateString === typeof currentDateString
                ? typeof previousDateString
                : `${typeof previousDateString} and ${typeof currentDateString}`
            }'. Please submit an issue on this action's GitHub repo.`
          )
        }
        return Date.parse(previousDateString) < Date.parse(currentDateString) ? previous : current
      })

      // Set the array of Check Suites to an array of one containing the first Check Suite created
      checkSuites = [firstCheckSuite]
    }

    // Ignore this Check Run's Check Suite
    checkSuites.filter(checkSuite => checkSuiteID !== checkSuite.id)

    const highestPriorityCheckSuiteStatus = getHighestPriorityCheckSuiteStatus(checkSuites)
    if (highestPriorityCheckSuiteStatus === CheckSuiteStatus.completed) {
      const highestPriorityCheckSuiteConclusion = getHighestPriorityCheckSuiteConclusion(checkSuites)
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
    const response = await client.checks.listSuitesForRef({
      owner,
      repo,
      ref
    })
    if (response.status !== 200) {
      throw new Error(
        `Failed to list check suites for ${owner}/${repo}@${ref}. ` +
          `Expected response code 200, got ${response.status}.`
      )
    }
    resolve(response.data)
  })
}

function diagnose(checkSuites: Octokit.ChecksListSuitesForRefResponseCheckSuitesItem[]): SimpleCheckSuiteMeta[] {
  return checkSuites.map<SimpleCheckSuiteMeta>(
    checkSuite =>
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
  checkSuites: Octokit.ChecksListSuitesForRefResponseCheckSuitesItem[]
): CheckSuiteStatus {
  return checkSuites
    .map(checkSuite => CheckSuiteStatus[checkSuite.status as keyof typeof CheckSuiteStatus])
    .reduce((previous, current, currentIndex) => {
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
  checkSuites: Octokit.ChecksListSuitesForRefResponseCheckSuitesItem[]
): CheckSuiteConclusion {
  return checkSuites
    .map(checkSuite => CheckSuiteConclusion[checkSuite.conclusion as keyof typeof CheckSuiteConclusion])
    .reduce((previous, current, currentIndex) => {
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
