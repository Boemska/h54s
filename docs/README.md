Welcome to the documentation for h54s from Boemska. If you are looking for a specific reference guide for either SAS or JS you'll want to jump straight to either the [SAS API Reference](./sas-api-reference.md) or the [JavaScript API Reference](./js-api-reference.md) guide.

Below you'll find an overview of how h54s works, the data structures and the conventions, as well as the data type mappings. If you have previously built SAS&reg; Stored Process based web applications you might have used parameters. We do things slightly differently around here and you'll find our explanation for that below too.

As always, if you have any questions don't hesitate to reach out to a member of the team or create an issue on the repository.

# Data Structures and Conventions

The *Atomic Unit of Data transfer* for a H54S based App is the Dataset. This is a universal concept familiar to both JS and SAS programmers. In JavaScript Speak, a Dataset is an [object array](http://www.w3schools.com/js/js_json_syntax.asp), similar to the one created in the example above. Using [this terminology](http://www.w3schools.com/js/js_arrays.asp), each object in an array is the row of a dataset, and each of it's named members is the value of a variable of the same name.

Data Types between the front-end and back-end are mapped as follows:

# JavaScript to SAS

| JavaScript | SAS      | Notes                                                                   |
|------------|----------|-------------------------------------------------------------------------|
| String     | String   | ASCII only at the moment. Working on UTF support                        |
| Numeric    | Numeric  | Same precision in both SAS and JS. Enforced.                            |
| Boolean    |          | Not permitted by adapter. Throws typeError. Use numerics for bools.     |
| Null       |          | Ignored. The value for the column is not included for that row.         |
| Undefined  |          | Same as Null                                                            |

To send dates to SAS, use `h54s.toSasDateTime(date)` to convert instance of `Date` object to numeric SAS date value.

# SAS to JavaScript

| SAS      | JavaScript | Notes                                                                                               |
|----------|------------|-----------------------------------------------------------------------------------------------------|
| String   | String     | NewLine characters are stripped.                                                                    |
| Numeric  | Numeric    | Same precision in both SAS and JS.                                                                  |
| Datetime | Date()     | SAS Datetime columns are converted to Date() objects if their column name is prefixed with 'DT_' (by default, conditional can be edited [here](https://github.com/Boemska/h54s/blob/master/dist/h54s.js#L948))    |
| Date     |            | Unsupported. You won't be able to transmit data as SAS Dates. Convert, use output views and DHMS()   |

To parse numeric dates sent from SAS, use `h54s.fromSasDateTime(date)` to convert numeric SAS date value to JavaScript `Date` object

# But what about Parameters? I'm used to Parameters

Say goodbye to Parameters. For the purposes of H54S-based apps, Datasets supersede them. Input validation and typechecking should be done by your JavaScript app, and the Adapter ensures type safety and handles exceptions. If you're just looking to pass a single value back, you'll need to use a 'single-column, single-row table'. It might not seem like it to start with, but it's a blessing once you start working with multiple programmers and writing interface specifications.

To get a control table with some parameters, your JS code would look like this:
```javascript
var paramsRow={};
    paramsRow.myStringParam = 'stuff and things';
    paramsRow.myNumericParam = 123.123;
    paramsRow.myDatetimeParam = new Date();

var paramTable = [paramsRow];

    data.addTable(paramTable,'controlTable');
```

and the following SAS code would get you a table called `WORK.CONTROL` with three columns and one row:

```sas
%bafGetDataset(controlTable, WORK.CONTROL);
```

Voila.


