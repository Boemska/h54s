var gulp = require('gulp');
var gutil = require('gulp-util');
var browserify = require('browserify');
var watchify = require('watchify');
var buffer = require('vinyl-buffer');
var uglify = require('gulp-uglify');
var gulpif = require('gulp-if');
var karma = require('karma');
var source = require('vinyl-source-stream');
var flatten = require('gulp-flatten');
var clean = require('gulp-clean');
var jshint = require('gulp-jshint');
var stylish = require('jshint-stylish');
var replace = require('gulp-replace');
var rename = require("gulp-rename");
var gulpsync = require('gulp-sync')(gulp);
var webserver = require('gulp-webserver');

var pkg = require('./package.json');

var filePaths = {
  releaseDir: './dist/',
  releaseBuild: './dist/h54s.js',
  releaseBuildMin: './dist/h54s.min.js',
  devDir: './dev/',
  devBuild: './dev/h54s.js',
  srcDir: './src/',
  srcFiles: './src/**/*.js',
  srcEntryfile: './src/h54s.js',
  unitTestFiles: './test/js/unit/**/*.js',
  sasResponses: './test/js/sas_responses/**/*.js',
  browserifyTestFiles: './test/js/browserify/**/*.js',
  integrationTestFiles: './test/js/integration/**/*.js',
  performanceTestFiles: ['./test/js/performance/response.js', './test/js/performance/test.js'],
  helperTestFiles: './test/js/*.js',
  testRemoteConfigFile: './test/h54sConfig.json'
};

var production = false,
  ugly = false,
  watch = true;

function bundle() {
  var b = browserify({
    debug: true,
    entries: [filePaths.srcEntryfile],
    standalone: 'h54s',
    cache: {},
    packageCache: {}
  });

  if(watch) {
    b = watchify(b);
  }

  var buildPath = production ? filePaths.releaseDir : filePaths.devDir;

  var rebundle = function() {
    return b.bundle()
    .on('error', function(err) {
      gutil.log(err);
    })
    .pipe(source(filePaths.srcEntryfile))
    .pipe(gulpif(production, replace("('/base/test/h54sConfig.json')", "('h54sConfig.json')")))
    .pipe(replace('__version__', pkg.version))
    .pipe(gulpif(ugly, buffer()))
    .pipe(gulpif(ugly, uglify()))
    .pipe(gulpif(ugly, rename('h54s.min.js')))
    .pipe(flatten())
    .pipe(gulp.dest(buildPath));
  };

  if(watch) {
    b.on('update', rebundle);
  }
  return rebundle();
}

gulp.task('set-production', ['unset-watch'], function() {
  production = true;
});

gulp.task('set-ugly', ['unset-watch'], function() {
  ugly = true;
});

gulp.task('unset-watch', function() {
  watch = false;
});

gulp.task('clean', function(cb) {
  if(production) {
    return gulp.src(filePaths.releaseDir, {read: false}).pipe(clean());
  } else {
    return gulp.src(filePaths.devDir, {read: false}).pipe(clean());
  }
});

gulp.task('jshint', function() {
  return gulp.src([
    'gulpfile.js',
    filePaths.srcFiles,
    filePaths.helperTestFiles,
    filePaths.unitTestFiles,
    filePaths.integrationTestFiles,
    filePaths.browserifyTestFiles
  ])
  .pipe(jshint())
  .pipe(jshint.reporter(stylish))
  .pipe(jshint.reporter('fail'));
});

gulp.task('build-dev', ['clean'], bundle);

gulp.task('build-production', ['jshint', 'set-production'], bundle);
gulp.task('build-ugly', ['jshint', 'set-production', 'set-ugly'], bundle);

//default build and test it
gulp.task('default', ['jshint', 'unset-watch', 'build-dev'], function(done) {
  new karma.Server({
    configFile: __dirname + '/karma.conf.js',
    files: [
      {pattern: 'test/*.json', served: true, included: false},
      {pattern: filePaths.devBuild, served: true},
      {pattern: filePaths.helperTestFiles},
      {pattern: filePaths.sasResponses},
      {pattern: filePaths.unitTestFiles},
      {pattern: filePaths.integrationTestFiles}
    ],
    singleRun: true
  }, function() {
    done();
    process.exit();
  }).start();
});

//used in development
gulp.task('watch', ['build-dev'], function(done) {
  new karma.Server({
    configFile: __dirname + '/karma.conf.js',
    files: [
      {pattern: 'test/*.json', served: true, included: false},
      {pattern: filePaths.devBuild, served: true},
      {pattern: filePaths.helperTestFiles},
      {pattern: filePaths.sasResponses},
      {pattern: filePaths.unitTestFiles},
      {pattern: filePaths.integrationTestFiles},
      {pattern: filePaths.browserifyTestFiles}
    ],
    frameworks: ['browserify', 'mocha', 'proclaim', 'testdouble'],
    preprocessors: {
      './test/js/browserify/**/*.js': [ 'browserify' ]
    },
    browserify: {
      debug: true
    },
    singleRun: false
  }, done).start();
});

//used in development
gulp.task('watch-unit', ['build-dev'], function(done) {
  new karma.Server({
    configFile: __dirname + '/karma.conf.js',
    files: [
      {pattern: 'test/*.json', served: true, included: false},
      {pattern: filePaths.devBuild, served: true},
      {pattern: filePaths.helperTestFiles},
      {pattern: filePaths.sasResponses},
      {pattern: filePaths.unitTestFiles},
      {pattern: filePaths.browserifyTestFiles}
    ],
    frameworks: ['browserify', 'mocha', 'proclaim', 'testdouble'],
    preprocessors: {
      './test/js/browserify/**/*.js': [ 'browserify' ]
    },
    browserify: {
      debug: true
    },
    singleRun: false
  }, done).start();
});

gulp.task('test-release', ['jshint', 'build-production'], function(done) {
  new karma.Server({
    configFile: __dirname + '/karma.conf.js',
    files: [
      {pattern: filePaths.releaseBuild, served: true},
      {pattern: filePaths.helperTestFiles},
      {pattern: filePaths.sasResponses},
      {pattern: filePaths.unitTestFiles},
      {pattern: filePaths.integrationTestFiles},
    ],
    exclude: [
      './test/js/**/remoteConfig.js'
    ],
    singleRun: true
  }, done).start();
});

gulp.task('test-ugly', ['jshint', 'build-ugly'], function(done) {
  new karma.Server({
    configFile: __dirname + '/karma.conf.js',
    files: [
      {pattern: filePaths.releaseBuildMin, served: true},
      {pattern: filePaths.helperTestFiles},
      {pattern: filePaths.sasResponses},
      {pattern: filePaths.unitTestFiles},
      {pattern: filePaths.integrationTestFiles},
    ],
    exclude: [
      './test/js/**/remoteConfig.js'
    ],
    singleRun: true
  }, done).start();
});

gulp.task('test-performance', ['build-dev'], function(done) {
  var files = [
    {pattern: 'test/*.json', served: true, included: false},
    {pattern: filePaths.devBuild, served: true},
    {pattern: filePaths.helperTestFiles}
  ].concat(filePaths.performanceTestFiles);

  new karma.Server({
    configFile: __dirname + '/karma.conf.js',
    files: files,
    frameworks: ['browserify', 'mocha', 'proclaim', 'testdouble'],
    preprocessors: {
      './test/js/browserify/**/*.js': [ 'browserify' ]
    },
    browserify: {
      debug: true
    },
    singleRun: true
  }, function() {
    done();
    process.exit();
  }).start();
});

gulp.task('release', gulpsync.sync(['set-production', 'clean', 'test-release', 'test-ugly']), function(done) {
  done();
  process.exit();
});

gulp.task('serveAngular', ['build-dev'], function() {
  return gulp.src(['./examples/angular/', './dev/', './test/js/'])
    .pipe(webserver({
      port: 1337
    }));
});

gulp.task('serveExtjs', ['build-dev'], function() {
  return gulp.src(['./examples/extjs/', './dev/', './test/js/'])
    .pipe(webserver({
      port: 1337
    }));
});

gulp.task('serveExtjs2', ['build-dev'], function() {
  return gulp.src(['./examples/extjs2/', './dev/', './test/js/'])
    .pipe(webserver({
      port: 1337
    }));
});

gulp.task('serveW2UI', ['build-dev'], function() {
  return gulp.src(['./examples/w2ui/', './dev/', './test/js/'])
    .pipe(webserver({
      port: 1337
    }));
});

gulp.task('serveOpenUI5', ['build-dev'], function() {
  return gulp.src(['./examples/openui5/', './dev/', './test/js/'])
    .pipe(webserver({
      port: 1337
    }));
});
