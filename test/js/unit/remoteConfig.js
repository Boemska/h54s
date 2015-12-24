describe('h54s unit -', function() {
  describe('Remote config tests:', function() {

    it('Test remote config', function(done) {
      var sasAdapter = new h54s({
        isRemoteConfig: true,
        debug: false
      });
      //wait for the file
      setTimeout(function() {
        assert.equal(sasAdapter.url, '/SASStoredProcess/do', 'Url is not set with config');
        assert.equal(sasAdapter.metadataRoot, '/AJAX/', 'Metadata root has wrong value');
        assert.equal(sasAdapter.ajaxTimeout, 20000, 'Aajax timeout has wrong value');
        //config property should have higher priority over remote config properties
        //so debug should be false from the constructor - override the remote config property
        assert.isFalse(sasAdapter.debug, 'Constructor config is not overriding the remote config');
        done();
      }, 100);
    });

    it('Test remote config load event', function(done) {
      var sasAdapter = new h54s({
        isRemoteConfig: true
      });

      //it should be false - default from the constructor
      assert.isFalse(sasAdapter.debug, 'Debug property should be false at this point');

      sasAdapter.onRemoteConfigUpdate(function() {
        //same as in h54sConfig.json
        assert.isTrue(sasAdapter.debug, 'We have wrong value for debug property');
        done();
      });
    });

  });
});
