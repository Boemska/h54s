# Build Instructions

1. Clone the project.
2. Run `npm install`
3. Install gulp-cli if it's not installed already - `npm install -g gulp-cli`.
4. Edit the host URL, user and pass in /test/js/_server_data.js.
5. Run `gulp`. It will run jshint and karma tests and creates build in dev/ directory. There are more gulp tasks.

  * `gulp watch` - Runs tests on file change.

  * `gulp release` - Creates dist/h54s.js and dist/h54s.min.js release files and runs karma tests with those files.

  * `gulp serveAngular` - Creates web server and serves angular.js example (default port is 1337)

  * `gulp serveExtjs` - Creates web server and serves ext.js example (default port is 1337)

  * `gulp serveExtjs2` - Creates web server and serves ext.js example (default port is 1337)

  * `gulp serveW2UI` - Creates web server and serves w2ui example (default port is 1337)


