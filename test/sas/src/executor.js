"use strict";

var childProcess = require('child_process');
var fs = require('fs');

module.exports = function (execFile) {
  var child = childProcess.execFile(execFile, ['-stdio']);
  return new Promise((fulfill, reject) => {
    var outData = '', errData = '';

    function stdoutCallback(chunk) {
      outData += chunk.toString();
    }
    function stderrCallback(chunk) {
      var patt = /(\d+\s+)?(%put )?--codeend--;?/g;
      var scriptEnded = patt.test(chunk.toString());

      if(scriptEnded) {
        fulfill({
          out: outData,
          err: errData
        });
        child.stdout.removeListener('data', stdoutCallback);
        child.stderr.removeListener('data', stderrCallback);
        child.kill();
      } else {
        errData += chunk.toString();
        if(errData.indexOf('ERROR') !== -1) {
          //throw new error with message from sas
          reject(new Error(errData.match(/ERROR:[^\n]*/)[0]));
        }

        //done loading?
        if(chunk.toString().indexOf('processing completed') !== -1) {
          child.stdin.write(`%include '${__dirname}/../generated.sas';\n`);
          fs.readFile('../../../sasautos/h54s.sas', (err, data) => {
            if(err) {
              console.log(err);
              return;
            }
            var h54sSasContent = data.toString().replace(/%let\sbatchOutFile.+;/g, '%let batchOutFile=STDOUT;');
            child.stdin.write(h54sSasContent);
            child.stdin.write(`%include '${__dirname}/../h54sTest.sas';\n`);
            child.stdin.write('%put --codeend--;\n');
          });
        }
      }
    }

    child.stdout.on('data', stdoutCallback);
    child.stderr.on('data', stderrCallback);
  });
}
