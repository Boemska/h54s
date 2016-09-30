# h54s SAS test generator

This application will generate test data .sas file based on your input (or settings.json file), try to parse it with h54s.sas parser, and check if the data is not corrupted.

First input accepts number or string with data types which is something like `DSSND`.
This means 5 columns with types date, string, string, number, date.

### install
```npm install```

### run
```npm test```

Line 118 in h54s.sas needs to be changed for this to work
