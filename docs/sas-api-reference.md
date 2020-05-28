# SAS API Reference

## %bafGetDatasets;

This macro deserialises all the JavaScript data objects that have been passed into SAS tables. The name of the dataset is part of the adapter JS call.

## %bafHeader;

This macro prepares the output stream for data object output. Conceptually similar to `%STPBEGIN`

## %bafOutDataset(objectName, libn, dsn);

This macro serialises a SAS dataset to a JavaScript data object.

`objectName` is the name of the target JS object that the table will be serialised into

`libn` is the libname of the dataset to be serialised and transmitted to the frontend

`dsn` is the name of the dataset itself

## %bafFooter;

This macro closes the output stream for data objects. Counterpart to `%bafHeader`. Conceptually similar to `%STPEND`.

