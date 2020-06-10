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
      assert.equal('/SASStoredProcess/someValue', sasAdapter.url, 'Url is not set with config1');
      sasAdapter = new h54s({
        url: 'someValue',
        hostUrl: serverData.hostUrl
      });
      assert.equal(serverData.hostUrl + 'someValue', sasAdapter.url, 'Full url is not correct');
      assert.isFalse(sasAdapter.debug, 'Debug option is not correct');
      sasAdapter = new h54s({
        debug: true
      });
      assert.isTrue(sasAdapter.debug, 'Debug option is not set');
      done();
    });


    //TODO: This test needs re-writing for the new SasData method.
     it('Test tables object', function(done) {
       var data = new h54s.SasData([
         {
           libname: 'WORK',
           memname: 'CHOSENLIB'
         }
       ], 'dataOne');

       assert.isDefined(data._files.dataOne, 'dataOne macro not inserted');

       data.addTable([
         {
           libname: 'Test',
           memname: 'chl'
         }
       ], 'dataTwo');

       assert.isDefined(data._files.dataTwo, 'dataTwo macro not inserted');

       done();
     });

    //TODO this test needs re-writing for the new SasData method
    it('Test very long table name', function(done) {
      proclaim.throws(function() {
        new h54s.SasData([
          {
            libname: 'WORK',
            memname: 'CHOSENLIB'
          }
        ], 'data123456789012345678901234567890');
      }, 'Table name too long. Maximum is 32 characters');

      proclaim.doesNotThrow(function() {
        new h54s.SasData([
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
