/* global describe, it, assert, serverData, h54s, proclaim */
describe('h54s', function() {
  describe('init:', function() {

    it('should throw error if config data is missing or empty', function(done) {
      proclaim.doesNotThrow(function() {
        var sasAdapter = new h54s(); // jshint ignore:line
      });
      proclaim.doesNotThrow(function() {
        var sasAdapter = new h54s({}); // jshint ignore:line
      });
      done();
    });

    it('test config settings', function(done) {
      var sasAdapter;
      sasAdapter = new h54s({
        url: '/SASStoredProcess/someValue'
      });
      assert.equal('/SASStoredProcess/someValue', sasAdapter.url, 'Url is not set with config');
      sasAdapter = new h54s({
        url: '/someValue',
        hostUrl: serverData.url
      });
      assert.equal(serverData.url + 'someValue', sasAdapter.url, 'Full url is not correct');
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

  });
});
