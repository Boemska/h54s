# h54s Node-based SAS Test Generator

This application is designed to validate the SAS parser component of the adapter. It will generate test data .sas file based on your input (or settings.json file), use the h54s.sas parser code to parse the generated data objects, and check for data consistency. The output is an input/output comparison map, and optionally, some log files that document any inconsistencies. 

For a 12 column, 20 row table with mixed String/Date/Numeric data types, the comparison map looks like this:

![image](https://cloud.githubusercontent.com/assets/11962123/19016197/2f3d3290-880b-11e6-9c19-1ca5d740dc97.png)


### Installing 

To install the needed libraries, navigate to `test/sas` and run

```npm install```

Node version 4.5.0 or later is required.

### Running

To test the parser, run the following:

```npm test```

To record the SAS inputs and outputs and for a comparison log of failures in the `log` directory, run the following:

```npm test -- --log```

The first input accepts a number, for a randomly generated sequence of columns of random type. Alternatively it accepts a string with data types. `DSSND` will create a five column table with a Date, String, String, Numeric, Date column.

Here is an [asciinema demo](https://asciinema.org/a/08v4c1tecnmtgahwmcuds65zv)  of the whole thing. 


