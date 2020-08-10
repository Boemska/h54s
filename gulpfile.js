var gulp = require('gulp');
var gutil = require('gulp-util');
var browserify = require('browserify');
var watchify = require('watchify');
var buffer = require('vinyl-buffer');
var uglify = require('gulp-uglify-es').default;
var gulpif = require('gulp-if');
var karma = require('karma');
var source = require('vinyl-source-stream');
var flatten = require('gulp-flatten');
var clean = require('gulp-clean');
// var jshint = require('gulp-jshint');
// var stylish = require('jshint-stylish');
var replace = require('gulp-replace');
var rename = require("gulp-rename");
var babel = require("babelify");

var pkg = require('./package.json');

var filePaths = {
	releaseDir: './dist/',
	releaseBuild: './dist/h54s.js',
	releaseBuildMin: './dist/h54s.min.js',
	devDir: './dev/',
	devBuild: './dev/h54s.js',
	srcDir: './src/',
	srcFiles: './src/**/*.js',
	srcEntryfile: ['./src/h54s.js'],
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
	watch = true,
	es5 = false;

function bundle() {
	var b;

	if (es5) {
		b = browserify({
			debug: true,
			entries: filePaths.srcEntryfile,
			standalone: 'h54s',
			cache: {},
			packageCache: {}
		}).transform(babel)
	} else {
		browserify({
			debug: true,
			entries: filePaths.srcEntryfile,
			standalone: 'h54s',
			cache: {},
			packageCache: {}
		})
	}

	if (watch) {
		b = watchify(b);
	}

	var buildPath = production ? filePaths.releaseDir : filePaths.devDir;

	var rebundle = function () {
		return b.bundle()
			.on('error', function (err) {
				gutil.log(err);
			})
			.pipe(source(filePaths.srcEntryfile[0]))
			.pipe(gulpif(production, replace("('/base/test/h54sConfig.json')", "('h54sConfig.json')")))
			.pipe(replace('__version__', pkg.version))
			.pipe(gulpif(ugly, buffer()))
			.pipe(gulpif(ugly, uglify()))
			.pipe(gulpif(ugly, rename('h54s.min.js')))
			.pipe(flatten())
			.pipe(gulp.dest(buildPath));
	};

	if (watch) {
		b.on('update', rebundle);
	}
	return rebundle();
}


gulp.task('unset-watch', function(done) {
  watch = false;
  done();
});

gulp.task('set-production', gulp.series('unset-watch', function (done) {
	production = true;
  done();
}));

gulp.task('set-babel', gulp.series('unset-watch', function(done) {
	es5 = true;
	filePaths.srcEntryfile = ['./src/h54s.js', "node_modules/@babel/polyfill"];
	filePaths.releaseDir= "./es5/";
	done();
}));

gulp.task('unset-watch', function (done) {
	watch = false;
	done();
});
gulp.task('set-ugly',  gulp.series('unset-watch', function(done) {
  ugly = true;
  done();
}));

gulp.task('clean', function (cb) {
	if (production) {
		return gulp.src(filePaths.releaseDir, {read: false, allowEmpty: true}).pipe(clean());
	} else {
		return gulp.src(filePaths.devDir, {read: false, allowEmpty: true}).pipe(clean());
	}
});

gulp.task('jshint', function () {
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

gulp.task('build-dev', gulp.series('clean', bundle));
gulp.task('build-production', gulp.series('set-production', bundle));
gulp.task('build-ugly', gulp.series(gulp.series('set-production', 'set-ugly'), bundle));
gulp.task('build-es5', gulp.series(gulp.series('set-production', 'set-ugly', 'set-babel'), bundle));

//default build and test it
gulp.task('default', gulp.series(gulp.series('unset-watch', 'build-dev'), function (done) {
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
		proxies: {
			"/h54sConfig.json": "/base/test/h54sConfig.json"
		},
		singleRun: true
	}, function () {
		done();
		process.exit();
	}).start();
}));

//used in development
gulp.task('watch', gulp.series('build-dev', function (done) {
	new karma.Server({
		configFile: __dirname + '/karma.conf.js',
		files: [
			{pattern: filePaths.testRemoteConfigFile, served: true, included: false},
			{pattern: filePaths.devBuild, served: true},
			{pattern: filePaths.helperTestFiles},
			{pattern: filePaths.sasResponses},
			{pattern: filePaths.unitTestFiles},
			{pattern: filePaths.integrationTestFiles},
			{pattern: filePaths.browserifyTestFiles}
		],
		frameworks: ['browserify', 'mocha', 'proclaim', 'testdouble'],
		preprocessors: {
			'./test/js/browserify/**/*.js': ['browserify']
		},
		proxies: {
			"/h54sConfig.json": "/base/test/h54sConfig.json"
		},
		browserify: {
			debug: true
		},
		singleRun: false
	}, done).start();
}));

//used in development
gulp.task('watch-unit', gulp.series('build-dev', function (done) {
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
			'./test/js/browserify/**/*.js': ['browserify']
		},
		browserify: {
			debug: true
		},
		singleRun: false
	}, done).start();
}));

gulp.task('test-release', gulp.series('build-production', function (done) {
	new karma.Server({
		configFile: __dirname + '/karma.conf.js',
		files: [
			{pattern: filePaths.releaseBuild, served: true},
			{pattern: filePaths.helperTestFiles},
			{pattern: filePaths.sasResponses},
			{pattern: filePaths.unitTestFiles},
			// temporarily disabling integration tests until we fix sas server side
			// {pattern: filePaths.integrationTestFiles},
		],
		exclude: [
			'./test/js/**/remoteConfig.js'
		],
		singleRun: true
	}, done).start();
}));

gulp.task('test-ugly', gulp.series('build-ugly', function (done) {
	new karma.Server({
		configFile: __dirname + '/karma.conf.js',
		files: [
			{pattern: filePaths.releaseBuildMin, served: true},
			{pattern: filePaths.helperTestFiles},
			{pattern: filePaths.sasResponses},
			{pattern: filePaths.unitTestFiles},
			// temporarily disabling integration tests until we fix sas server side
			// {pattern: filePaths.integrationTestFiles},
		],
		exclude: [
			'./test/js/**/remoteConfig.js'
		],
		singleRun: true
	}, done).start();
}));

gulp.task('test-performance', gulp.series('build-dev', function (done) {
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
			'./test/js/browserify/**/*.js': ['browserify']
		},
		browserify: {
			debug: true
		},
		singleRun: true
	}, function () {
		done();
		process.exit();
	}).start();
}));

gulp.task('release', gulp.series(gulp.series(gulp.series('set-production', 'clean'), 'test-release'), 'test-ugly'), function (done) {
	done();
	process.exit();
});

