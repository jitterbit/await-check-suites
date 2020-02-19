// import {wait} from '../src/wait'
// import * as process from 'process'
// import * as cp from 'child_process'
// import * as path from 'path'

test('gets checkSuiteID', () => {
  const response = {
    data: {
      check_suite_url: 'https://api.github.com/repos/jitterbit/cloud-studio/check-suites/467079434'
    }
  }
  const checkSuiteIDString: string | undefined = ((response.data as any).check_suite_url as string).split('/').pop()
  expect(checkSuiteIDString).toBeTruthy()
  if (!checkSuiteIDString) {
    fail('unreachable')
  }
  const checkSuiteID = parseInt(checkSuiteIDString)
  expect(checkSuiteID).toEqual(467079434)
})

// test('throws invalid number', async () => {
//   const input = parseInt('foo', 10)
//   await expect(wait(input)).rejects.toThrow(`seconds (${input}) is not a number`)
// })

// test('wait 500 ms', async () => {
//   const start = new Date()
//   await wait(0.5)
//   const end = new Date()
//   var delta = Math.abs(end.getTime() - start.getTime())
//   expect(delta).toBeGreaterThan(450)
// })

// // shows how the runner will run a javascript action with env / stdout protocol
// test('test runs', () => {
//   process.env['INPUT_REF'] = 'master'
//   const ip = path.join(__dirname, '..', 'lib', 'main.js')
//   const options: cp.ExecSyncOptions = {
//     env: process.env
//   }
//   console.log(cp.execSync(`node ${ip}`, options).toString())
// })
