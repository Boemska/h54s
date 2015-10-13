/* global describe, it, assert, serverData, h54s */
describe('h54s', function() {
  describe('Ajax test:', function() {

    it('Test timeout', function(done) {
      this.timeout(10000);
      var sasAdapter = new h54s({
        ajaxTimeout: 1 //1ms
      });
      assert.isDefined(sasAdapter._utils.ajax, 'Ajax is not defined');
      assert.isFunction(sasAdapter._utils.ajax.setTimeout, 'Ajax get method is not defined');

      sasAdapter._utils.ajax.get(serverData.url + 'SASLogon/Logon.do', {
        _debug: "0",
        _sasapp: "Stored Process Web App 9.3",
        _service: "default",
        ux: serverData.user,
        px: serverData.pass,
      }).success(function(res) {
        assert.notOk(res, 'Ajax response is undefined');
        done();
      }).error(function() {
        //it's supposed to throw an error
        done();
      });
    });

  });
});
