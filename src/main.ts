import * as core from '@actions/core'
import {GitHub} from '@actions/github'
import {getInput} from './get-input'
import {CheckSuiteConclusion, waitForCheckSuites} from './wait-for-check-suites'

async function run(): Promise<void> {
  try {
    const {
      owner,
      repo,
      ref,
      token,
      ignoreOwnCheckSuite,
      waitForACheckSuite,
      intervalSeconds,
      timeoutSeconds,
      failStepIfUnsuccessful,
      appSlugFilter,
      onlyFirstCheckSuite
    } = getInput()

    const conclusion = await waitForCheckSuites({
      client: new GitHub(token),
      owner,
      repo,
      ref,
      ignoreOwnCheckSuite,
      waitForACheckSuite,
      intervalSeconds,
      timeoutSeconds,
      appSlugFilter,
      onlyFirstCheckSuite
    })

    core.info(`Conclusion: ${conclusion}`)

    core.setOutput('conclusion', conclusion)

    if (conclusion !== CheckSuiteConclusion.success && failStepIfUnsuccessful) {
      core.setFailed('One or more of the check suites were unsuccessful.')
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
