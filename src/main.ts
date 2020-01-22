import * as core from '@actions/core'
import {context, GitHub} from '@actions/github'
import {getInput} from './getInput'
import {CheckSuiteConclusion, waitForCheckSuites} from './wait-for-check-suites'

async function run(): Promise<void> {
  try {
    core.debug(JSON.stringify(context))

    const {
      owner,
      repo,
      ref,
      token,
      ignoreOwnCheckSuite,
      waitForACheckSuite,
      intervalSeconds,
      timeoutSeconds,
      failStepOnFailure,
      appSlugFilter
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
      appSlugFilter
    })

    core.info(`Conclusion: ${conclusion}`)

    core.setOutput('conclusion', conclusion)

    if (conclusion !== CheckSuiteConclusion.success && failStepOnFailure) {
      core.setFailed('One or more of the check suites were unsuccessful.')
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
