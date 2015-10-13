/* global describe, it, assert, serverData, h54s, proclaim, getRandomAsciiChars, setTimeout */
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
      proclaim.throws(function() {
        new h54s.Tables([]);
      });
      sasAdapter.call('test', null, function() {});
      done();
    });

    it('Should throw error if credentials are missing', function(done) {
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      proclaim.throws(function() {
        sasAdapter.login();
      });
      proclaim.throws(function() {
        sasAdapter.login('username');
      });
      proclaim.throws(function() {
        sasAdapter.login('username', {}, function() {});
      });
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
      this.timeout(10000);
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
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        assert.equal(status, 200, "We got wrong status code");
        done();
      });
    });

    it('Call sas program without logging in', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      //logout because we are already logged in in previeous tests
      sasAdapter._utils.ajax.get( serverData.url + 'SASStoredProcess/do', {_action: 'logoff'}).success(function(res) {
        assert.equal(res.status, 200, 'Log out is not successful');
        sasAdapter.call('/AJAX/h54s_test/startupService', null, function(err, res) {
          assert.equal(err.message, 'You are not logged in', 'Should throw error because user is not logged in');
          assert.isUndefined(res, 'We got error, res should be undefined');
          done();
        });
      });
    });

    it('Log in with wrong credentials', function(done) {
      this.timeout(6000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      sasAdapter.login('username', 'pass', function(status) {
        assert.equal(status, -1, 'We got wrong status code');
        done();
      });
    });

    it('Debug mode test', function(done) {
      this.timeout(6000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        debug: true
      });
      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        if(status === 200) {
          sasAdapter.call('/AJAX/h54s_test/startupService', null, function(err) {
            assert.isUndefined(err, 'We got error on sas program ajax call');
            done();
          });
        }
      });
    });

    it('Test concurent calls', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });

      var finishedRequests = 0;

      var data1 = getRandomAsciiChars(1000);
      var data2 = getRandomAsciiChars(10);

      var table = new h54s.Tables([
        {
          data: data1
        }
      ], 'data');

      sasAdapter.call('/AJAX/h54s_test/BounceData', table, function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        assert.isDefined(res, 'Response is undefined');
        assert.equal(res.outputdata[0].DATA, data1, 'data1 is not the same in response');
        finishedRequests++;
        if(finishedRequests === 2) {
          done();
        }
      });

      table = new h54s.Tables([
        {
          data: data2
        }
      ], 'data');

      sasAdapter.call('/AJAX/h54s_test/BounceData', table, function(err, res) {
        assert.isUndefined(err, 'We got error on sas program ajax call');
        assert.isDefined(res, 'Response is undefined');
        assert.equal(res.outputdata[0].DATA, data2, 'data2 is not the same in response');
        finishedRequests++;
        if(finishedRequests === 2) {
          done();
        }
      });
    });

    it('Test pending calls after login', function(done) {
      this.timeout(20000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });

      var counter = 0;

      sasAdapter._utils.ajax.get(serverData.url + 'SASStoredProcess/do', {_action: 'logoff'}).success(function() {
        sasAdapter.call('/AJAX/h54s_test/startupService', null, function(err) {
          if(!err) {
            counter++;
          }
        });
        sasAdapter.call('/AJAX/h54s_test/startupService', null, function(err) {
          if(!err) {
            counter++;
          }
        });
        sasAdapter.call('/AJAX/h54s_test/startupService', null, function(err) {
          if(!err) {
            counter++;
          }
        });
        sasAdapter.login(serverData.user, serverData.pass, function(status) {
          assert.equal(status, 200, 'We got wrong status code');
          assert.equal(counter, 0, 'Some calls are already executed - should\'ve waited for login');
          setTimeout(function() {
            assert.equal(counter, 3, 'Some pending calls are not executed');
            done();
          }, 2000);
        });
      });
    });

  });
});
