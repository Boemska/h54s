/************************************************************************/
/*                    .__     .________   _____                         */
/*                    |  |__  |   ____/  /  |  |  ______                */
/*                    |  |  \ |____  \  /   |  |_/  ___/                */
/*                    |   Y  \/       \/    ^   /\___ \                 */
/*                    |___|  /______  /\____   |/____  >                */
/*                         \/       \/      |__|     \/                 */
/*                                                                      */
/************************************************************************/

%GLOBAL h54ssource h54ssource2 h54slrecl h54snotes h54starget 
        h54sDeveloperMode h54sDebuggingMode _debug h54sIsViya;

/*  if we are developing, set this to 1; */
%let h54sDeveloperMode = 0;
/*  this is always set to = to start with; */
%let h54sDebuggingMode = 0;

/*  check platform */
data _null_;
  major = substr(symget("SYSVER"), 1, find(symget("SYSVER"), ".")-1);         
  if major eq "V" then do;
    call symput('h54sIsViya', '1');
    /*  optimisations for avoiding reopening connection to
        viya files service multiple times for appending output */
    call symput('h54sBufferTarget', 'thiscall');
    call symput('h54sJsonTarget', 'thisjson');
    call symput('h54sBufferWriteMode', 'mod');
  end;
  else do; 
    call symput('h54sIsViya', '0');
    call symput('h54sBufferTarget', '_webout');
    call symput('h54sJsonTarget', '_webout');
    call symput('h54sBufferWriteMode', '');
  end;
run;


%macro bafQuietenDown;
  %let h54ssource=%sysfunc(getoption(source));
  %let h54ssource2=%sysfunc(getoption(source2));
  %let h54slrecl=%sysfunc(getoption(lrecl));
  %let h54snotes=%sysfunc(getoption(notes));
  options nosource nosource2 nonotes;
%mend;

%macro bafQuietenUp;
  options &h54ssource &h54ssource2 lrecl=&h54slrecl &h54snotes; 
%mend;


/*  go quiet while sourcing */
%bafQuietenDown;

%macro bafCheckDebug;
  /*  this runs for each request. 
      debugging mode inserts data delimiters
      into SPWA output so log can be parsed out
  */
  %if &h54sIsViya = 0 %then %do;
    %if %symExist(_debug) %then %do;
      %if &_debug = 131 %then %do;
        %let h54sDebuggingMode = 1;
      %end;
      %else %do;
        %let h54sDebuggingMode = 0;
      %end;
    %end;
  %end;
%mend;


%macro bafGetDatasets(h54sdates=);
  %bafCheckDebug;
  /* quieten down the log unless we are debugging */
  %if (&h54sDeveloperMode ne 1) %then %bafQuietenDown;

  /* _WEBIN_NAME has the name of each parameter for the counterpart spec
     _WEBIN_FILE_COUNT has the total number of files. If 1 then we need no suffix */
  %if %symexist(_webin_file_count) = 0 %then %do;
    %put [h54s] There are no WEBIN files;
    %if (&h54sDeveloperMode ne 1) %then %bafQuietenUp;
    /* No tables were sent */
    %return;
  %end;
  %put [h54s] WEBIN file count is &_WEBIN_FILE_COUNT.;

  /*  Reserved uploads: Generic file uploads or OMI metadata queries.
      bafpn is the index of a file described as FILE
      bafxn is the index of a file described as XML
      global vars initialised
  */
  %global bafpn;
  %global bafxn;
  %let bafpn=;
  %let bafxn=;

  /*  baftn is the current index of the file (table) being iterated over */
  %do files = 1 %to &_WEBIN_FILE_COUNT;
    /*  if there is only one file the counts do not get number suffix */
    %if &_WEBIN_FILE_COUNT = 1 %then %let baftn=;
    %else %do;
      %let baftn=&files.;
    %end;

    /*  references to file and spec */
    %let thisobj=&&_WEBIN_name&baftn;
    %let testspec=&&&&&&_WEBIN_name&baftn.;

    %put [h54s]    Evaluating filename &&&&_WEBIN_name&baftn;
    /*  if a spec comes back as FILE when it is not a table 
        if that is called MYFILE it is SAS code
        if that is called XML it is an OMI metadata query
    */
    %if (%UPCASE("&&&&&&_WEBIN_name&baftn.") eq "FILE") %then %do;
      %if (%UPCASE("&&&&_WEBIN_name&baftn.") eq "MYFILE") %then %do;
        %let bafpn=&baftn.;
        %put Found MYFILE (program) as input number &baftn.;
      %end;
      %else %if (%UPCASE("&&&&_WEBIN_name&baftn.") eq "XML") %then %do;
        %let bafxn=&baftn.;
        %put Found XML (meta query) as input number &baftn.;
      %end;
    %end;
    %else %do;

      /* build data step length and input statements for this input table */
      data _null_;
        length spec $32767;
        length lenspec $50;
        length varname $32;
        spec=symget(symget(cats("_WEBIN_NAME","&baftn.")));
        /* viya 3.5 - remove nrstr wrap and character escaping */ 
        spec=prxchange("s/\%([\'\""\%\(\)])/$1/", -1 , prxchange('s/^\%nrstr\((.*)\)/$1/s', -1, spec));
        colcount=countw(spec, '|');

        do c=1 to colcount;
          lenspec=scan(spec, c, '|');
          varname=upcase(scan(lenspec,1,','));
          select (scan(lenspec, 2, ','));
              when ('num') do;
                indef=varname!!':best16.';
              end;
              when ('string') do;
                indef=cats(varname,':$',scan(lenspec, 3, ','),'.');
              end;
              when ('date') do;
                if ( &h54sdates ne ); then;
                  indef=varname!!':best.';
                end;
              end;
          end;

          /* input statement to macro */
          pname=cats('cols', c);
          call symputx(pname, indef, 'L');
          output;
        end;
        call symputx('totalcol', colcount);
      run;

      /* parse the actual input data */

  %put [h54s]  start deserialising table &&_WEBIN_NAME&baftn. - table filename is &&_WEBIN_FILEREF&baftn. ;

    %if &h54sIsViya eq 1 %then %do;

      filename thisfile filesrvc "&&_WEBIN_FILEURI&baftn." ;	
      data "&&_WEBIN_NAME&baftn."n;
        INFILE thisfile LRECL=32767 recfm=v dsd termstr=crlf;
        input %do j=1 %to &totalcol.;
        &&cols&j.
        %end;
        ;
      run;

    %end;
    %else %do;

      data "&&_WEBIN_NAME&baftn."n;
        INFILE &&_WEBIN_FILEREF&baftn. LRECL=32767 recfm=v dsd termstr=crlf;
        input %do j=1 %to &totalcol.;
        &&cols&j.
        %end;
        ;
      run;
      
    %end;

  %put [h54s]  finish deserialising table &&_WEBIN_name&baftn. ;

    %end;
  %end;

  %put [h54s] summary of all deserialised tables;
    proc sql noprint;
    %do files = 1 %to &_WEBIN_FILE_COUNT;
        %if &_WEBIN_FILE_COUNT eq 1 %then %do;
            %let baftn=;
        %end;
        %else %do;
            %let baftn=&files.;
        %end;
      %if &baftn ne &bafpn and &baftn ne &bafxn %then %do;
        describe table "&&_WEBIN_name&baftn."n;
      %end;
    %end;
    %put [h54s] summary end;
    quit;

  %if (&h54sDeveloperMode ne 1) %then %bafQuietenUp;
%mend;

%macro bafOutDataset(outputas, outlib, outdsn, h54skeys=);
  %bafCheckDebug;
  %if (&h54sDeveloperMode ne 1) %then %bafQuietenDown;

  data _null_;
    file &h54sBufferTarget &h54sBufferWriteMode;
    put '"' "&outputas." '" : ';
  run;


  %if (&h54sIsViya) %then %do;
    filename &h54sJsonTarget temp;
  %end;

  %put [h54s] Writing JSON for &outlib..&outdsn. &h54skeys;

  proc contents
      data = &outlib..&outdsn.
            noprint
            out = _h54sinfo
            (keep = name varnum type);
  run;

  %if (&h54skeys ne ) %then %do;
  data _h54sinfo;
    set _h54sinfo;
    name = upcase(name);
    varnum = varnum - 1;
  run;
  %end;

  options validvarname=upcase;
  proc json out=&h54sJsonTarget. ; 
    %if (&h54skeys ne ) %then %do;
    write open array;
      write open array;
        export _h54sinfo / nosastags;
      write close;
    %end;
      write open array;
        export &outlib..&outdsn. / &h54skeys nosastags
              nofmtnumeric nofmtdatetime;
      write close;
    %if (&h54skeys ne ) %then %do;
    write close;
    %end;
  run;

  %symdel h54skeys / nowarn;

  %if (&h54sIsViya) %then %do; 
  data _null_;
     length data $1;
     INFILE &h54sJsonTarget recfm=n;
     file &h54sBufferTarget  recfm=n &h54sBufferWriteMode;
     input data  $char1. @@;
     put data $char1. @@;
  run;

  %if (&h54sIsViya) %then %do;
    filename &h54sJsonTarget clear;
  %end;

  %end;

  data _null_;
    file &h54sBufferTarget &h54sBufferWriteMode;
    put ',';
  run;
  %if (&h54sDeveloperMode ne 1) %then %bafQuietenUp;
%mend;
  

%macro bafHeader();
  %bafCheckDebug;
  /* quieten down the log unless we are debugging */
  %if (&h54sDeveloperMode ne 1) %then %bafQuietenDown;
  /* create temp file */
  %if (&h54sIsViya) %then %do;
    filename &h54sBufferTarget temp;
  %end;

  data _null_;
    file &h54sBufferTarget &h54sBufferWriteMode;
    %if &h54sDebuggingMode = 1 %then %do;
      put "--h54s-data-start--";
    %end;
    put '{';
  run;
  %if (&h54sDeveloperMode ne 1) %then %bafQuietenUp;
%mend;


%macro bafFooter();
  %bafCheckDebug;
  /* quieten down the log unless we are debugging */
  %if (&h54sDeveloperMode ne 1) %then %bafQuietenDown;

  %if (%symexist(usermessage) = 0) %then %do;
    %let usermessage = blank;
  %end;

  %if (%symexist(logmessage) = 0) %then %do;
    %let logmessage = blank;
  %end;

  %if (%symexist(h54src) = 0) %then %do;
    %let h54src = success;
  %end;


  %if (&h54sIsViya) %then %do;
    data _null_;
      file &h54sBufferTarget &h54sBufferWriteMode;
      sasdatetime=datetime();
      put '"usermessage" : "' "&usermessage." '",';
      put '"logmessage" : "' "&logmessage." '",';
      put '"requestingUser" : "' "&SYS_COMPUTE_SESSION_OWNER." '",';
      put '"requestingPerson" : "' "&SYS_COMPUTE_SESSION_OWNER." '",';
      put '"executingPid" : ' "&sysjobid." ',';
      put '"sasDatetime" : ' sasdatetime ',';
      put '"status" : "' "&h54src." '"}';
      put;
    run;

    /*  JES files service is faster without updates 
        so bundle data into a temp filename first
        http://support.sas.com/kb/20/784.html ; */
    %put [h54s] Writing buffered output to Viya ;

    data _null_;
      length data $1;
      INFILE &h54sBufferTarget recfm=n;
      file _webout  recfm=n ;
      input data  $char1. @@;
      put data $char1. @@;
    run;  

  %end;
  %else %do;
    data _null_;
      file &h54sBufferTarget ;
      sasdatetime=datetime();
      put '"usermessage" : "' "&usermessage." '",';
      put '"logmessage" : "' "&logmessage." '",';
      put '"requestingUser" : "' "&_METAUSER." '",';
      put '"requestingPerson" : "' "&_metaperson." '",';
      put '"executingPid" : ' "&sysjobid." ',';
      put '"sasDatetime" : ' sasdatetime ',';
      put '"status" : "' "&h54src." '"}';
      put;

      %if &h54sDebuggingMode = 1 %then %do;
        put "--h54s-data-end--";
      %end;
    run;

  %end;

  %if (&h54sDeveloperMode ne 1) %then %bafQuietenUp;
%mend;

/* come back after defining */
%bafQuietenUp;
