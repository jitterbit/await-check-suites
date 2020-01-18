import * as core from '@actions/core'
import {GitHub} from '@actions/github'
import {getInput} from './getInput'
import {waitForCheckSuites} from './wait-for-check-suites'

async function run(): Promise<void> {
  try {
    const {
      owner,
      repo,
      ref,
      token,
      ignoreOwnCheckSuite,
      intervalSeconds,
      timeoutSeconds,
      failStepOnFailure,
      appSlugFilter
    } = getInput()

    const success = await waitForCheckSuites({
      client: new GitHub(token),
      owner,
      repo,
      ref,
      ignoreOwnCheckSuite,
      intervalSeconds,
      timeoutSeconds,
      appSlugFilter
    })

    core.setOutput('conclusion', success ? 'true' : 'false')

    if (!success && failStepOnFailure) {
      core.setFailed('One or more of the check suites were unsuccessful.')
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
