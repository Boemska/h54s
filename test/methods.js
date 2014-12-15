describe('h54s', function() {
  describe('methods test:', function() {

    it('Should throw error if arguments are not provided', function(done) {
      var sasAdapter = new h54s();
      expect(function() {
        sasAdapter.call();
      }).to.throw(Error);
      expect(function() {
        sasAdapter.call({});
      }).to.throw(Error);
      expect(function() {
        sasAdapter.call({
          sasProgram: 'test'
        });
      }).to.throw(Error);
      expect(function() {
        sasAdapter.call('test');
      }).to.throw(Error);
      sasAdapter.call('test', function() {});
      done();
    });

    it('Should throw error if credentials are missing', function(done) {
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      expect(function() {
        sasAdapter.setCredentials();
        sasAdapter.setCredentials('username');
      }).to.throw(Error);
      sasAdapter.setCredentials('username', 'pass');
      done();
    });

    it('Try to log in on wrong url without credentials', function(done) {
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      expect(function() {
        sasAdapter.login();
      }).to.throw(Error);
      done();
    });

    it('Try to log in with credentials and callback', function(done) {
      this.timeout(4000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        loginUrl: '/invalidUrl'
      });
      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        assert.equal(404, status, "We got wrong status code");
        done();
      });
    });

    it('Try to log in with credentials and callback', function(done) {
      this.timeout(4000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url
      });
      sasAdapter.login(serverData.user, serverData.pass, function(status) {
        assert.equal(200, status, "We got wrong status code");
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
        assert.equal(200, status, "We got wrong status code");
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
        assert.equal(200, res.status, 'Log out is not successful');
        sasAdapter.call('/Shared Folders/h54s_Apps/logReporting/startupService', function(err, res) {
          assert.equal(err.message, 'You are not logged in', 'Should throw error because user is not logged in');
          assert.isUndefined(res, 'We got error, res should be undefined');
          done();
        });
      });
    });

    it('Test auto login', function(done) {
      this.timeout(6000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        autoLogin: true,
        user: serverData.user,
        pass: serverData.pass
      });
      //logout because we are already logged in in previeous tests
      sasAdapter._utils.ajax.get(serverData.url + 'SASStoredProcess/do', {_action: 'logoff'}).success(function(res) {
        assert.equal(200, res.status, 'Log out is not successful');
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
        assert.equal('Unable to parse response json', err.message, 'We should get json parsing error');
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
        assert.equal(-1, status, 'We got wrong status code');
        done();
      });
    });

    it('Add table test', function(done) {
      this.timeout(4000);
      var sasAdapter = new h54s({
        hostUrl: serverData.url,
        autoLogin: true,
        user: serverData.user,
        pass: serverData.pass
      });

      var timeMs    = new Date('Mon Sep 29 2014 12:00:00 GMT+0200 (CEST)').getTime();
      var timeMsEnd = timeMs + 60 * 60 * 1000 * 24 * 30;

      var sasStart  = toSasDatetime(new Date(timeMs));
      var sasEnd    = toSasDatetime(new Date(timeMsEnd));

      sasAdapter.addTable([{
        javastart: timeMs,
        javaend: timeMsEnd,
        sasstart: sasStart,
        sasend: sasEnd
      }],'timespan');
      sasAdapter.call('/Shared Folders/h54s_Apps/logReporting/drillHour', function(err, res) {
        assert.isUndefined(err, 'We got unexpected error');
        assert.isObject(res, 'Result should be object');
        done();
      });

      function toSasDatetime (jsDate) {
        var basedate = new Date(Date.now() - 100 * 60 * 60 * 24 * 2);
        var currdate = jsDate;

        // offsets for UTC and timezones and BST
        var baseOffset = basedate.getTimezoneOffset(); // in minutes
        var currOffset = currdate.getTimezoneOffset(); // in minutes

        // convert currdate to a sas datetime
        var offsetSecs = (currOffset - baseOffset) * 60; // offsetDiff is in minutes to start with
        var baseDateSecs = basedate.getTime() / 1000; // get rid of ms
        var currdateSecs = currdate.getTime() / 1000; // get rid of ms
        var sasDatetime = Math.round(currdateSecs - baseDateSecs - offsetSecs); // adjust

        return sasDatetime;
      }

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
