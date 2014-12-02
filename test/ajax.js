describe('h54s', function() {
  describe('Ajax test:', function() {

    it('Test post method', function(done) {
      assert.isDefined(ajax, 'Ajax is not defined');
      assert.isFunction(ajax.post, 'Ajax get method is not defined');
      ajax.post(serverData.url + 'SASLogon/Logon.do', {
        _debug: "0",
        _sasapp: "Stored Process Web App 9.3",
        _service: "default",
        ux: serverData.user,
        px: serverData.pass,
      }).success(function(res) {
        assert.isDefined(res, 'Ajax response is undefined');
        done();
      }).error(function(res) {
        assert.notOk(res, 'Ajax got error');
        done();
      });
    });

    it('Test get method', function(done) {
      assert.isDefined(ajax, 'Ajax is not defined');
      assert.isFunction(ajax.get, 'Ajax get method is not defined');
      ajax.get(serverData.url + 'SASLogon/Logon.do', {
        _debug: "0",
        _sasapp: "Stored Process Web App 9.3",
        _service: "default",
        ux: serverData.user,
        px: serverData.pass,
      }).success(function(res) {
        assert.isDefined(res, 'Ajax response is undefined');
        done();
      }).error(function(res) {
        assert.notOk(res, 'Ajax got error');
        done();
      });
    });

  });
});
