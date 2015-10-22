module.exports = function (grunt) {
  var bannerContent = '/*! <%= pkg.name %> v<%= pkg.version %> - ' +
      '<%= grunt.template.today("yyyy-mm-dd") %> \n' +
      ' *  License: <%= pkg.license %> \n' +
      ' *  Author: <%= pkg.author %> \n*/\n';

  var name        = '<%= pkg.name %>';
  var devRelease  = 'dist/'+name+'.js';
  var minRelease  = 'dist/'+name+'.min.js';

  var srcFiles    = ['src/ie_polyfills.js', 'src/h54s.js', 'src/methods.js', 'src/utils.js'];

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    jshint: {
      options: {
        trailing: true,
        unused: true,
        undef: true,
        camelcase: true
      },
      target: {
        src: [
          'src/**/*.js',
          'test/**/*.js',
          'examples/**/*.js',
          '!examples/extjs2/lib/*',
          '!examples/angular/js/libs/*',
          '!examples/w2ui/lib/*'
        ]
      }
    },
    concat: {
      options: {
        banner: bannerContent,
        process: function(src, filepath) {
          return src.replace("('/base/test/h54sConfig.json')", "('h54sConfig.json')");
        }
      },
      target: {
        src: srcFiles,
        dest: devRelease
      }
    },
    uglify: {
      options: {
        banner: bannerContent,
        sourceMapRoot: '../',
        sourceMap: 'dist/'+name+'.min.js.map',
        sourceMapUrl: name+'.min.js.map'
      },
      target : {
        src : srcFiles,
        dest : 'dist/' + name + '.min.js'
      }
    },
    karma: {
      options: {
        configFile: 'karma.conf.js',
        files: [
          'test/**/*.js',
          {pattern: 'test/**/*.json', served: true, included: false}
        ],
        singleRun: true
      },
      dev: {
        files: [
          {src: srcFiles, served: true}
        ],
        autoWatch: true,
        singleRun: false
      },
      run: {
        files: [
          {src: srcFiles},
          {src: 'test/**/*.js'},
          {src: 'test/**/*.json', served: true, included: false}
        ]
      },
      release: {
        files: [
          {src: 'dist/h54s.js', served: true},
        ],
        exclude: [
          'test/remoteConfig.js'
        ]
      },
      ugly: {
        files: [
          {src: 'dist/h54s.min.js', served: true},
        ],
        exclude: [
          'test/remoteConfig.js'
        ]
      }
    },
    connect: {
      angular: {
        port: 1337,
        combine: ['examples/angular', 'dist', 'test']
      },
      extjs: {
        port: 1337,
        combine: ['examples/extjs', 'dist', 'test']
      },
      extjs2: {
        port: 1337,
        combine: ['examples/extjs2', 'dist', 'test']
      },
      w2ui: {
        port: 1337,
        combine: ['examples/w2ui', 'dist', 'test']
      }
    }
  });

  // Always show stack traces when Grunt prints out an uncaught exception.
  grunt.option('stack', true);

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-karma');
  grunt.loadNpmTasks('grunt-connect');

  grunt.registerTask('default', ['jshint', 'karma:run']);
  grunt.registerTask('release', ['jshint', 'concat', 'karma:release', 'uglify', 'karma:ugly']);
  grunt.registerTask('watch', 'karma:dev');

  grunt.registerTask('serveAngular', 'connect:angular');
  grunt.registerTask('serveExtjs', 'connect:extjs');
  grunt.registerTask('serveExtjs2', 'connect:extjs2');
  grunt.registerTask('serveW2UI', 'connect:w2ui');
};
