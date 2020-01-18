import * as core from '@actions/core'
import {GitHub} from '@actions/github'
import Octokit, {
  ChecksListSuitesForRefResponseCheckSuitesItem
} from '@octokit/rest'

enum CheckSuiteStatus {
  Queued = 'queued',
  InProgress = 'in_progress',
  Completed = 'completed'
}
enum CheckSuiteConclusion {
  ActionRequired = 'action_required',
  Canceled = 'canceled',
  TimedOut = 'timed_out',
  Failed = 'failed',
  Neutral = 'neutral',
  Success = 'success'
}
enum CheckTheCheckSuitesResult {
  Queued = 'queued',
  InProgress = 'in_progress',
  Success = 'success',
  Unsuccessful = 'unsuccessful'
}

interface WaitForCheckSuitesOptions {
  client: GitHub
  owner: string
  repo: string
  ref: string
  ignoreOwnCheckSuite: boolean
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
  appSlugFilter: string | null
}
interface GetCheckSuitesOptions {
  client: GitHub
  owner: string
  repo: string
  ref: string
  ignoreOwnCheckSuite: boolean
}
interface SimpleCheckSuiteMeta {
  id: number
  app: {
    slug: string
  }
  status: CheckSuiteStatus
  conclusion: CheckSuiteConclusion
}

export async function waitForCheckSuites(
  options: WaitForCheckSuitesOptions
): Promise<boolean> {
  const {
    client,
    owner,
    repo,
    ref,
    ignoreOwnCheckSuite,
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
      appSlugFilter
    })
    if (result === CheckTheCheckSuitesResult.Success) {
      resolve(true)
    } else if (result === CheckTheCheckSuitesResult.Unsuccessful) {
      resolve(false)
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
        appSlugFilter
      })
      if (result === CheckTheCheckSuitesResult.Success) {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        resolve(true)
      } else if (result === CheckTheCheckSuitesResult.Unsuccessful) {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        resolve(false)
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
): Promise<CheckTheCheckSuitesResult> {
  const {client, owner, repo, ref, ignoreOwnCheckSuite, appSlugFilter} = options

  return new Promise(async resolve => {
    const checkSuitesAndMeta = await getCheckSuites({
      client,
      owner,
      repo,
      ref,
      ignoreOwnCheckSuite
    })
    if (
      checkSuitesAndMeta.total_count === 0 ||
      checkSuitesAndMeta.check_suites.length === 0
    ) {
      core.info('No check suites exist for this commit.')
      resolve(CheckTheCheckSuitesResult.Success)
    }
    const checkSuites = appSlugFilter
      ? checkSuitesAndMeta.check_suites.filter(
          checkSuite => checkSuite.app.slug === appSlugFilter
        )
      : checkSuitesAndMeta.check_suites
    if (checkSuites.length === 0) {
      core.info(
        `No check suites with the app slug '${appSlugFilter}' exist for this commit.`
      )
      resolve(CheckTheCheckSuitesResult.Success)
    }
    if (isAllCompleted(checkSuites)) {
      if (isAllSuccessful(checkSuites)) {
        resolve(CheckTheCheckSuitesResult.Success)
      } else {
        core.error(
          'One or more check suites were unsuccessful. ' +
            'Below is some metadata on the check suites.'
        )
        core.error(JSON.stringify(diagnose(checkSuites), null, 2))
        resolve(CheckTheCheckSuitesResult.Unsuccessful)
      }
    } else {
      const lowestCheckSuiteStatus = getLowestCheckSuiteStatus(checkSuites)
      switch (lowestCheckSuiteStatus) {
        case CheckSuiteStatus.Queued: {
          resolve(CheckTheCheckSuitesResult.Queued)
          break
        }
        case CheckSuiteStatus.InProgress: {
          resolve(CheckTheCheckSuitesResult.InProgress)
          break
        }
        default: {
          throw new Error(
            `Lowest check suite status should not be '${lowestCheckSuiteStatus}' since isAllCompleted() returned false. ` +
              "Please file an issue on this action's GitHub page."
          )
        }
      }
    }
  })
}

async function getCheckSuites(
  options: GetCheckSuitesOptions
): Promise<Octokit.ChecksListSuitesForRefResponse> {
  return new Promise(async resolve => {
    const result = await options.client.checks.listSuitesForRef({
      owner: options.owner,
      repo: options.repo,
      ref: options.ref
    })
    if (result.status !== 200) {
      throw new Error(
        `Failed to list check suites for ${options.owner}/${options.repo}@${options.ref}. ` +
          `Expected response code 200, got ${result.status}.`
      )
    }
    resolve(result.data)
  })
}

function diagnose(
  checkSuites: ChecksListSuitesForRefResponseCheckSuitesItem[]
): SimpleCheckSuiteMeta[] {
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

function isAllCompleted(
  checkSuites: ChecksListSuitesForRefResponseCheckSuitesItem[]
): boolean {
  return checkSuites.every(
    checkSuite => checkSuite.status === CheckSuiteStatus.Completed
  )
}

function getLowestCheckSuiteStatus(
  checkSuites: ChecksListSuitesForRefResponseCheckSuitesItem[]
): CheckSuiteStatus {
  let lowestStatus = CheckSuiteStatus.Completed
  for (const checkSuite of checkSuites) {
    if (checkSuite.status === CheckSuiteStatus.Queued) {
      lowestStatus = CheckSuiteStatus.Queued
      break
    } else if (checkSuite.status === CheckSuiteStatus.InProgress) {
      lowestStatus = CheckSuiteStatus.InProgress
    }
  }
  return lowestStatus
}

function isAllSuccessful(
  checkSuites: ChecksListSuitesForRefResponseCheckSuitesItem[]
): boolean {
  return checkSuites.every(
    checkSuite => checkSuite.conclusion === CheckSuiteConclusion.Success
  )
}
