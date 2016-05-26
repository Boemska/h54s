describe('h54s unit -', function() {
  describe('Tables test:', function() {

    it('Exceptions in tables', function(done) {
      proclaim.throws(function() {
        new h54s.Tables([
          {a: "Dummy Name", specialNumberVal :NaN}
        ], 'data');
      }, 'NaN value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.Tables([
          {b: "Dummy Name", specialNumberVal: Infinity}
        ], 'data');
      }, 'Infinity value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.Tables([
          {c: "Dummy Name", specialNumberVal: -Infinity}
        ], 'data');
      }, '-Infinity value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.Tables([
          {d: "Dummy Name", boolVal: true}
        ], 'data');
      }, 'Boolean value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.Tables([
          {e: "Dummy Name", boolVal: false}
        ], 'data');
      }, 'Boolean value in one of the values (columns) is not allowed');

      done();
    });

    it('Convert table object test', function(done) {
      var expectedTable = {data: ['[{"colName":"prop1","colType":"string","colLength":3},{"colName":"prop2","colType":"num","colLength":8}]', '[{"prop1":"one","prop2":2}]']};
      var table = new h54s.Tables([{prop1: 'one', prop2: 2}], 'data');

      assert.deepEqual(table._tables, expectedTable, 'Wrong table');
      done();
    });

    it('Remove empty table row', function(done) {
      var table = new h54s.Tables([
        {prop: 'test'},
        {},
        {prop: 'test2'}
      ], 'data');
      assert.deepEqual(JSON.parse(table._tables.data[1]), [{prop: 'test'}, {prop: 'test2'}], 'Table data is wrong after removing empty row');
      done();
    });

  });
});
