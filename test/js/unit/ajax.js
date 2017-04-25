/* global describe, it, assert, h54s */
describe('h54s unit -', function() {
  describe('Ajax test:', function() {

    it('Ajax object', function(done) {
      var sasAdapter = new h54s();
      assert.isDefined(sasAdapter._ajax, 'Ajax is not defined');
      assert.isFunction(sasAdapter._ajax.setTimeout, 'Ajax setTimeout method is not defined');

      assert.isFunction(sasAdapter._ajax.get, 'Ajax get method is not defined');
      assert.isFunction(sasAdapter._ajax.post, 'Ajax post method is not defined');
      done();
    });

    it('Test timeout', function(done) {
      var sasAdapter = new h54s({
        ajaxTimeout: 1 //1ms
      });

      sasAdapter._ajax.get('http://example.com/').success(function(res) {
        assert.notOk(res, 'Ajax response is undefined');
        done();
      }).error(function() {
        //it's supposed to throw an error
        done();
      });
    });

    it('Test get', function(done) {
      var sasAdapter = new h54s();

      sasAdapter._ajax.get('http://example.com/', {
        testParameter: 'test'
      }).success(function(res) {
        done();
      }).error(function(err) {
        assert.notOk(err, 'Ajax get error');
        done();
      });
    });

    it('Test post', function(done) {
      var sasAdapter = new h54s();

      sasAdapter._ajax.post('http://example.com/', {
        testParameter: 'test'
      }).success(function(res) {
        done();
      }).error(function(err) {
        assert.notOk(err, 'Ajax post error');
        done();
      });
    });

  });
});
