import * as core from '@actions/core'
import {GitHub} from '@actions/github'
import Octokit, {ChecksListSuitesForRefResponseCheckSuitesItem} from '@octokit/rest'

enum CheckSuiteStatus {
  Queued = 'queued',
  InProgress = 'in_progress',
  Completed = 'completed'
}
export enum CheckSuiteConclusion {
  ActionRequired = 'action_required',
  Canceled = 'canceled',
  TimedOut = 'timed_out',
  Failed = 'failed',
  Neutral = 'neutral',
  Success = 'success'
}

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

export async function waitForCheckSuites(
  options: WaitForCheckSuitesOptions
): Promise<CheckSuiteConclusion> {
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
    if (result === CheckSuiteConclusion.Success) {
      resolve(CheckSuiteConclusion.Success)
      return
    } else if (result !== CheckSuiteStatus.Queued && result !== CheckSuiteStatus.InProgress) {
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
      if (result === CheckSuiteConclusion.Success) {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        clearInterval(intervalId)
        resolve(CheckSuiteConclusion.Success)
        return
      } else if (result !== CheckSuiteStatus.Queued && result !== CheckSuiteStatus.InProgress) {
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
): Promise<Exclude<CheckSuiteStatus, CheckSuiteStatus.Completed> | CheckSuiteConclusion> {
  const {
    client,
    owner,
    repo,
    ref,
    // ignoreOwnCheckSuite,
    waitForACheckSuite,
    appSlugFilter
  } = options

  return new Promise(async resolve => {
    const checkSuitesAndMeta = await getCheckSuites({
      client,
      owner,
      repo,
      ref
    })

    // Log check suites for debugging purposes
    core.debug(JSON.stringify(checkSuitesAndMeta, null, 2))

    if (checkSuitesAndMeta.total_count === 0 || checkSuitesAndMeta.check_suites.length === 0) {
      if (waitForACheckSuite) {
        resolve(CheckSuiteStatus.Queued)
        return
      } else {
        core.info('No check suites exist for this commit.')
        resolve(CheckSuiteConclusion.Success)
        return
      }
    }
    const checkSuites = appSlugFilter
      ? checkSuitesAndMeta.check_suites.filter(checkSuite => checkSuite.app.slug === appSlugFilter)
      : checkSuitesAndMeta.check_suites
    if (checkSuites.length === 0) {
      if (waitForACheckSuite) {
        resolve(CheckSuiteStatus.Queued)
        return
      } else {
        core.info(`No check suites with the app slug '${appSlugFilter}' exist for this commit.`)
        resolve(CheckSuiteConclusion.Success)
        return
      }
    }

    // TODO: Use ignoreOwnCheckSuite here to filter checkSuites further

    const lowestCheckSuiteStatus = getLowestCheckSuiteStatus(checkSuites)
    if (lowestCheckSuiteStatus === CheckSuiteStatus.Completed) {
      const lowestCheckSuiteConclusion = getLowestCheckSuiteConclusion(checkSuites)
      if (lowestCheckSuiteConclusion === CheckSuiteConclusion.Success) {
        resolve(CheckSuiteConclusion.Success)
      } else {
        core.error(
          'One or more check suites were unsuccessful. ' +
            'Below is some metadata on the check suites.'
        )
        core.error(JSON.stringify(diagnose(checkSuites), null, 2))
        resolve(lowestCheckSuiteConclusion)
      }
    } else {
      resolve(lowestCheckSuiteStatus)
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

function getLowestCheckSuiteStatus(
  checkSuites: ChecksListSuitesForRefResponseCheckSuitesItem[]
): CheckSuiteStatus {
  return checkSuites
    .map(checkSuite => CheckSuiteStatus[checkSuite.status as keyof typeof CheckSuiteStatus])
    .reduce((previous, current) => {
      for (const status of [
        CheckSuiteStatus.Queued,
        CheckSuiteStatus.InProgress,
        CheckSuiteStatus.Completed
      ]) {
        if (previous === status) {
          return previous
        } else if (current === status) {
          return current
        }
      }
      return current
    }, CheckSuiteStatus.Completed)
}

function getLowestCheckSuiteConclusion(
  checkSuites: ChecksListSuitesForRefResponseCheckSuitesItem[]
): CheckSuiteConclusion {
  return checkSuites
    .map(
      checkSuite => CheckSuiteConclusion[checkSuite.conclusion as keyof typeof CheckSuiteConclusion]
    )
    .reduce((previous, current) => {
      for (const conclusion of [
        CheckSuiteConclusion.ActionRequired,
        CheckSuiteConclusion.Canceled,
        CheckSuiteConclusion.TimedOut,
        CheckSuiteConclusion.Failed,
        CheckSuiteConclusion.Neutral,
        CheckSuiteConclusion.Success
      ]) {
        if (previous === conclusion) {
          return previous
        } else if (current === conclusion) {
          return current
        }
      }
      return current
    }, CheckSuiteConclusion.Success)
}
