describe('h54s', function() {
  describe('methods test:', function() {

    it('Should throw error if arguments are not provided', function(done) {
      var sasAdapter = new h54s();
      proclaim.throws(function() {
        sasAdapter.call();
      });
      proclaim.throws(function() {
        sasAdapter.call({});
      });
      proclaim.throws(function() {
        sasAdapter.call({
          sasProgram: 'test'
        });
      });
      proclaim.throws(function() {
        sasAdapter.call('test');
      });
      sasAdapter.call('test', function() {});
      done();
    });

    it('Should throw error if credentials are missing', function(done) {
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      proclaim.throws(function() {
        sasAdapter.setCredentials();
        sasAdapter.setCredentials('username');
      });
      sasAdapter.setCredentials('username', 'pass');
      done();
    });

    it('Try to log in on wrong url without credentials', function(done) {
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      proclaim.throws(function() {
        sasAdapter.login();
      });
      done();
    });

    it('Try to log in with credentials and callback', function(done) {
      this.timeout(4000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        loginUrl: '/invalidUrl'
      });
      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        assert.equal(status, 404, "We got wrong status code");
        done();
      });
    });

    it('Try to log in with credentials and callback', function(done) {
      this.timeout(4000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        assert.equal(status, 200, "We got wrong status code");
        done();
      });
    });

    it('Try to log in with only callback', function(done) {
      this.timeout(4000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      sasAdapter.setCredentials(serverData.user, serverData.pass);
      sasAdapter.login(function(status) {
        assert.equal(status, 200, "We got wrong status code");
        done();
      });
    });

    it('Call sas program without logging in', function(done) {
      this.timeout(6000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      //logout because we are already logged in in previeous tests
      sasAdapter._utils.ajax.get( serverData.url + 'SASStoredProcess/do', {_action: 'logoff'}).success(function(res) {
        assert.equal(res.status, 200, 'Log out is not successful');
        sasAdapter.call('/Shared Folders/h54s_Apps/logReporting/startupService', function(err, res) {
          assert.equal(err.message, 'You are not logged in', 'Should throw error because user is not logged in');
          assert.isUndefined(res, 'We got error, res should be undefined');
          done();
        });
      });
    });

    it('Test auto login', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        autoLogin: true,
        user: serverData.user,
        pass: serverData.pass
      });
      //logout because we are already logged in in previeous tests
      sasAdapter._utils.ajax.get(serverData.url + 'SASStoredProcess/do', {_action: 'logoff'}).success(function(res) {
        assert.equal(res.status, 200, 'Log out is not successful');
        sasAdapter.call('/Shared Folders/h54s_Apps/logReporting/startupService', function(err, res) {
          assert.isUndefined(err, 'We got error on sas program ajax call');
          assert.isObject(res, 'We expected object to be returned by call method');
          done();
        });
      });
    });

    it('Test retry', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: 'http://example.com',
        url: '/'
      });
      sasAdapter.call('filePath', function(err, res) {
        assert.equal(err.message, 'Unable to parse response json', 'We should get json parsing error');
        done();
      });
    });

    it('Log in with wrong credentials', function(done) {
      this.timeout(4000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      sasAdapter.setCredentials('username', 'pass');
      sasAdapter.login(function(status) {
        assert.equal(status, -1, 'We got wrong status code');
        done();
      });
    });

    it('Test login on call after first login and logout', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });

      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        //logout and try to call sas program
        sasAdapter._utils.ajax.get( serverData.url + 'SASStoredProcess/do', {_action: 'logoff'}).success(function(res) {
          sasAdapter.call('/Shared Folders/h54s_Apps/logReporting/startupService', function(err, res) {
            assert.isUndefined(err, 'We got error on sas program ajax call');
            assert.isObject(res, 'We expected object to be returned by call method');
            done();
          });
        });
      });

    });

    it('Debug mode test', function(done) {
      this.timeout(6000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        debug: true
      });
      sasAdapter.setCredentials(serverData.user, serverData.pass);
      sasAdapter.call('/AJAX/h54s_test/startupService', function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        done();
      });
    });

  });
});
