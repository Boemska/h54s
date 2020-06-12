This document provides instructions on how to run the suite of tests for h54s.

## Install dependencies
In order to build h54s and run the test suite there are a number of dependencies that need to be satisfied.

### JS

1. Clone the project.
2. Run `yarn install`
3. Install gulp-cli if it's not installed already - `yarn global add gulp-cli`.
4. Edit the host URL, user and pass, and sasVersion in /test/js/_server_data.js.

### SAS
As you would expect, the h54s tests send and receive data from a SAS environment as part of the suite. In order to be able to successfully run the tests you need to configure your SAS environment.

Regardless of your SAS version, clone the repository to a location on your SAS Compute node (SASApp server for _SAS v9_ or SAS Compute Server for _Viya_).

#### v9

1. Import the `h54s_test.spk` file found in this folder. During the import process select a location that you are able to write to. During the import process you will need to map the code location to the location that you specified above.
2. Modify the `%include` paths in each of the `sas/integration/*.sas` files to the location you cloned the repository to.


#### Viya

1. For each of the `.sas` files in the `sas/integration` folder create a job definition. This can be done through the _/SASJobExecution_ web application in your environment. 
2. Modify the `%include` paths in each of the `sas/integration/*.sas` files to the location you cloned the repository to.
3. For each job definition that you create, right click on the job name and select properties. 
4. From the properties menu select "Parameters". Add the following parameter and then click save:
    * Name: `_output_type`
    * Default value: `html`
    * Field type: `Character`
    * Required: `false`


## Running the test suite

There are two different modes for running the test suite:

1. `gulp` -  This will run jshint and karma tests and creates build in dev/ directory. 
2. `gulp watch` - this will run the above `gulp` tests but will then wait and will re run the test suite on a file change event. This mode is useful for test drive development.

## Building a release

  * `gulp release` - Creates dist/h54s.js and dist/h54s.min.js release files and runs karma tests with those files.


