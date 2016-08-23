describe('h54s unit -', function() {
  describe('SAS Data test:', function() {

    it('Exceptions in tables', function(done) {
      proclaim.throws(function() {
        new h54s.Tables([
          {a: "Dummy Name", specialNumberVal :NaN}
        ], 'data');
        new h54s.SasData([
          {a: "Dummy Name", specialNumberVal :NaN}
        ], 'data');
      }, 'NaN value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.Tables([
          {b: "Dummy Name", specialNumberVal: Infinity}
        ], 'data');
        new h54s.SasData([
          {b: "Dummy Name", specialNumberVal: Infinity}
        ], 'data');
      }, 'Infinity value in one of the values (columns) is not allowed');

      proclaim.throws(function() {
        new h54s.Tables([
          {c: "Dummy Name", specialNumberVal: -Infinity}
        ], 'data');
        new h54s.SasData([
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
        new h54s.SasData([
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
        {prop: 'test2'},
        {prop1: null, prop2: undefined}
      ], 'data');
      assert.deepEqual(JSON.parse(table._tables.data[1]), [{prop: 'test'}, {prop: 'test2'}], 'Table data is wrong after removing empty row');


      table = new h54s.SasData([
        {prop: 'test'},
        {},
        {prop: 'test2'},
        {prop1: null, prop2: undefined}
      ], 'data');

      var reader = new FileReader();
      reader.onload = function() {
        assert.deepEqual(JSON.parse(reader.result), [{prop: 'test'}, {prop: 'test2'}], 'Table data is wrong after removing empty row');
        done();
      };
      reader.readAsText(table._files.data[1]);
    });

    it('Test parameter threshold', function(done) {
      var rows = [];

      //around 30kb after json stringivy
      for(var i = 0; i < 260; i++) {
        rows.push({
          data: getRandomAsciiLettersAndNumbers(100)
        });
      }

      var table = new h54s.Tables(rows, 'data');
      assert.equal(table._parameterThreshold, 30000, 'Threshold default value incorrect');
      assert.equal(table._tables.data.length, 2, 'Tables length not correct');

      table = new h54s.Tables(rows, 'data', 10000);
      assert.equal(table._tables.data.length, 4, 'Tables length not correct');

      table = new h54s.Tables(rows, 'data', 5000);
      assert.equal(table._tables.data.length, 7, 'Tables length not correct');

      table = new h54s.Tables(rows, 'data', 50000);
      assert.equal(table._tables.data.length, 2, 'Tables length not correct');

      done();
    });

    it('Test Files object', function(done) {
      var file = new File(['test'], 'testName', {type: 'text/plain;charset=UTF-8'});
      var files = new h54s.Files(file, 'macroName');

      assert.isDefined(files._files.macroName, 'File not set');
      done();
    });

    it('Test SasData object constructor with File', function(done) {
      var file = new File(['test'], 'testName', {type: 'text/plain;charset=UTF-8'});
      var sasData = new h54s.SasData(file, 'macroName');

      assert.isDefined(sasData._files.macroName, 'File not set');
      done();
    });

    it('Test SasData object constructor with Table', function(done) {
      var sasData = new h54s.SasData([{test: 1}], 'macroName');

      assert.isDefined(sasData._files.macroName, 'Table not set');
      done();
    });

    it('Test both Files and Tables in SasData object', function(done) {
      var sasData = new h54s.SasData([{test: 1}], 'macroName');

      var file = new File(['test'], 'testName', {type: 'text/plain;charset=UTF-8'});
      sasData.addFile(file, 'macroName');
      sasData.addFile(file, 'macro2Name');

      sasData.addTable([{test: 1}], 'macro2Name');

      assert.isDefined(sasData._files.macroName, 'Table not set');
      assert.isDefined(sasData._files.macro2Name, 'Table not set');

      assert.isDefined(sasData._files.macroName, 'File not set');
      assert.isDefined(sasData._files.macro2Name, 'File not set');
      done();
    });

    it('Test SasData specs', function(done) {
      var data = [{
        data1   : 'test',
        data2   : 1,
        dt_data3: new Date()
      }];

      var table = new h54s.SasData(data, 'data');
      assert.equal('data1,string,4|data2,num,8|dt_data3,date,8', table._files.data[0], 'Specs are not correct');
      done();
    });

  });
});

function byteLength(str) {
  // returns the byte length of an utf8 string
  var s = str.length;
  for (var i=str.length-1; i>=0; i--) {
    var code = str.charCodeAt(i);
    if (code > 0x7f && code <= 0x7ff) s++;
    else if (code > 0x7ff && code <= 0xffff) s+=2;
    if (code >= 0xDC00 && code <= 0xDFFF) i--; //trail surrogate
  }
  return s;
}
