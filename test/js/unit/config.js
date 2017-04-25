/* global describe, it, assert, h54s, proclaim */
describe('h54s unit -', function() {
  describe('Config:', function() {

    it('Should throw error if config data is missing or empty', function(done) {
      proclaim.doesNotThrow(function() {
        var sasAdapter = new h54s(); // jshint ignore:line
      });
      proclaim.doesNotThrow(function() {
        var sasAdapter = new h54s({}); // jshint ignore:line
      });
      done();
    });

    it('Test config settings', function(done) {
      var sasAdapter;
      var url = 'http://example.com/';
      sasAdapter = new h54s({
        url: '/SASStoredProcess/someValue'
      });
      assert.equal('/SASStoredProcess/someValue', sasAdapter.url, 'Url is not set with config');
      sasAdapter = new h54s({
        url: '/someValue',
        hostUrl: url
      });
      assert.equal(url + 'someValue', sasAdapter.url, 'Full url is not correct');
      assert.isFalse(sasAdapter.debug, 'Debug option is not correct');
      sasAdapter = new h54s({
        debug: true
      });
      assert.isTrue(sasAdapter.debug, 'Debug option is not set');
      done();
    });

    it('Test tables object', function(done) {
      var data = new h54s.Tables([
        {
          libname: 'WORK',
          memname: 'CHOSENLIB'
        }
      ], 'dataOne');

      assert.isDefined(data._tables.dataOne, 'dataOne macro not inserted');

      data.add([
        {
          libname: 'Test',
          memname: 'chl'
        }
      ], 'dataTwo');

      assert.isDefined(data._tables.dataTwo, 'dataTwo macro not inserted');

      done();
    });

    it('Test macrro name exception with number at the end', function(done) {
      proclaim.throws(function() {
        new h54s.Tables([
          {
            libname: 'WORK',
            memname: 'CHOSENLIB'
          }
        ], 'data1');
      }, 'Macro name cannot have number at the end');

      proclaim.doesNotThrow(function() {
        new h54s.Tables([
          {
            libname: 'WORK',
            memname: 'CHOSENLIB'
          }
        ], 'dataOne');
      });
      done();
    });

    it('Test metadataRoot value', function(done) {
      var callback = function() {};
      var expectedProgram = '/ajax/program.sas';

      var sasAdapter = new h54s({
        metadataRoot: '/ajax/'
      });

      sasAdapter._disableCalls = true; //disable calls for testing

      sasAdapter.call('program.sas', null, callback);
      sasAdapter.call('/program.sas', null, callback);

      assert.equal(sasAdapter._pendingCalls[0].params._program, expectedProgram, 'Wrong _program parameter - attempt 1');
      assert.equal(sasAdapter._pendingCalls[1].params._program, expectedProgram, 'Wrong _program parameter - attempt 2');

      sasAdapter = new h54s({
        metadataRoot: '/ajax'
      });

      sasAdapter._disableCalls = true; //disable calls for testing

      sasAdapter.call('program.sas', null, callback);
      sasAdapter.call('/program.sas', null, callback);

      assert.equal(sasAdapter._pendingCalls[0].params._program, expectedProgram, 'Wrong _program parameter - attempt 3');
      assert.equal(sasAdapter._pendingCalls[1].params._program, expectedProgram, 'Wrong _program parameter - attempt 4');

      done();
    });

    it('Test useMultipartFormData with SasData', function(done) {
      var table = new h54s.Tables([{}], 'data');
      var sasData = new h54s.SasData([{}], 'data');
      var file = new h54s.Files(new File([''], 'test'), 'data');
      var callback = function() {};

      // using test double function to return fake HTTP response
      function replacePost(sasAdapter) {
        var ajaxPostDouble = td.replace(sasAdapter._ajax, 'post');
        td.when(ajaxPostDouble(td.matchers.anything(), td.matchers.anything(), td.matchers.anything())).thenReturn({
          success: function(callback) {
            callback({
              responseText: '{}', //it doesn't matter what's returned, just that it doesn't throw an error
              status: 200
            });
            return this;
          },
          error: function() {}
        });
      }

      proclaim.doesNotThrow(function() {
        var sasAdapter = new h54s({
          useMultipartFormData: false
        });
        replacePost(sasAdapter);
        sasAdapter.call('...', table, callback);
      });
      proclaim.doesNotThrow(function() {
        var sasAdapter = new h54s();
        replacePost(sasAdapter);
        sasAdapter.call('...', sasData, callback);
      });
      proclaim.doesNotThrow(function() {
        var sasAdapter = new h54s();
        replacePost(sasAdapter);
        sasAdapter.call('...', table, callback);
      });
      proclaim.throws(function() {
        var sasAdapter = new h54s({
          useMultipartFormData: false
        });
        sasAdapter.call('...', sasData, callback);
      }, 'Cannot send files using application/x-www-form-urlencoded. Please use h54s.Tables or default value for useMultipartFormData', 'Error not thrown.');
      proclaim.throws(function() {
        var sasAdapter = new h54s({
          useMultipartFormData: false
        });
        sasAdapter.call('...', file, callback);
      }, 'Cannot send files using application/x-www-form-urlencoded. Please use h54s.Tables or default value for useMultipartFormData', 'Error not thrown.');
      td.reset();
      done();
    });

  });
});
