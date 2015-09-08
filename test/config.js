/* global describe, it, assert, serverData, h54s, proclaim, setTimeout */
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
      ], 'data1');

      assert.isDefined(data._tables.data1, 'data1 macro not inserted');

      data.add([
        {
          libname: 'Test',
          memname: 'chl'
        }
      ], 'data2');

      assert.isDefined(data._tables.data2, 'data2 macro not inserted');

      done();
    });

    //TODO: this test should run when we figure how to serve static json file with config using grunt and karma
    it('Test remote config', function(done) {
      var sasAdapter = new h54s({
        isRemoteConfig: true,
        debug: false
      });
      //wait for the file
      setTimeout(function() {
        console.log(sasAdapter);
        assert.equal('/SASStoredProcess/do', sasAdapter.url, 'Url is not set with config');
        assert.equal('/AJAX/', sasAdapter.metadataRoot, 'Metadata root has wrong value');
        assert.equal(20000, sasAdapter.ajaxTimeout, 'Aajax timeout has wrong value');
        //config property should have higher priority over remote config properties
        //so debug should be false from the constructor - override the remote config property
        assert.isFalse(sasAdapter.debug, 'Constructor config is not overriding the remote config');
        done();
      }, 100);
    });

  });
});
