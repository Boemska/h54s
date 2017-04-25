describe('h54s unit -', function() {
  describe('Remote config tests:', function() {

    it('Test remote config', function(done) {
      var sasAdapter = new h54s({
        isRemoteConfig: true,
        debug: false
      });
      //wait for the file
      sasAdapter.onRemoteConfigUpdate(function() {
        assert.equal(sasAdapter.url, '/SASStoredProcess/do', 'Url is not set with config');
        assert.equal(sasAdapter.metadataRoot, '/AJAX/', 'Metadata root has wrong value');
        assert.equal(sasAdapter.ajaxTimeout, 20000, 'Aajax timeout has wrong value');
        //config property should have higher priority over remote config properties
        //so debug should be false from the constructor - override the remote config property
        assert.isFalse(sasAdapter.debug, 'Constructor config is not overriding the remote config');
        done();
      });
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

    it('Test config settings before remote config is loaded', function(done) {
      var sasAdapter = new h54s({
        debug: true,
        isRemoteConfig: true
      });
      assert.isTrue(sasAdapter.debug, 'Debug option is not set');
      done();
    });

    it('Test remote config in call', function(done) {
      this.timeout(300);
      var sasAdapter = new h54s({
        isRemoteConfig: true
      });

      var loginDouble = td.replace(sasAdapter, 'login');
      var callDouble = td.replace(sasAdapter, 'call');

      var callDoFn = function(sasProgram) {
        this.onRemoteConfigUpdate(function() {
          var program = this._utils.getFullProgramPath(this.metadataRoot, sasProgram);
          assert.equal(program, '/AJAX/relative/path', 'Full program path wrong');
        }.bind(this));
      }.bind(sasAdapter);

      td.when(loginDouble('*', '*')).thenCallback(200);
      td.when(callDouble('/relative/path', null)).thenDo(callDoFn);
      td.when(callDouble('relative/path', null)).thenDo(callDoFn);
      td.when(callDouble('/relative/path', null)).thenCallback();
      td.when(callDouble('relative/path', null)).thenCallback();

      sasAdapter.login('*', '*', function(status) {
        assert.equal(status, 200, 'We got wrong status code');
        //metadataRoot is set to '/AJAX/' so the program path is prefixed with it
        sasAdapter.call('/relative/path', null, function(err) {
          assert.isUndefined(err, 'We got error on sas program ajax call');
        });
        sasAdapter.call('relative/path', null, function(err) {
          assert.isUndefined(err, 'We got error on sas program ajax call');
          td.reset();
          done();
        });
      });
    });

  });
});
