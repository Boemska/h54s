/************************************************************************/
/*            Parser and Generator for v1 of the Adapter                */
/*                                                                      */
/************************************************************************/


%macro bafGetDatasets();
  /*
  _WEBIN_NAME has the name of each parameter for the counterpart spec
  _WEBIN_FILE_COUNT has the total number of files. If 1 then we need no suffix
  */
  %if %symexist(_webin_file_count) = 0 %then %do;
    %return;
  %end;

  %put h54s ==> WEBIN FILE COUNT IS &_WEBIN_FILE_COUNT.;

  /*
  bafpn is the index of a file described as FILE
  bafxn is the index of a file described as XML
  global vars initialised
  */
  %global bafpn;
  %global bafxn;
  %let bafpn=;
  %let bafxn=;

  /* baftn is the index of the file (table) being iterated over */
  %do files = 1 %to &_WEBIN_FILE_COUNT;
    %if &_WEBIN_FILE_COUNT = 1 %then %let baftn=;
    %else %do;
      %let baftn=&files.;
    %end;

    /* references to file and spec */
    %let thisobj=&&_WEBIN_name&baftn;
    %let testspec=&&&&&&_WEBIN_name&baftn.;

    %put h54s ==> Evaluating filename &&&&_WEBIN_name&baftn;
    /* if a spec comes back as a FILE then it is not a table */
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
        spec=strip(scan(symget(symget(cats("_WEBIN_NAME","&baftn."))), 2, '()'));
        put spec=;
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
          end;


          * length statement specification here ;
          lname=cats('lens', c);
          * call symputx(lname, lendef, 'L');

          * input statement specification here ;

          pname=cats('cols', c);
          call symputx(pname, indef, 'L');
          output;
        end;
        call symputx('totalcol', colcount);
      run;

      /* parse the actual input data */

  options mprint mlogic symbolgen;
  %put h54s --- START DESERIALISING TABLE &&_WEBIN_name&baftn. ;
  %put h54s --- TABLE FILENAME IS &&_WEBIN_FILEURI&baftn. ;

      filename thisfile filesrvc "&&_WEBIN_FILEURI&baftn." ;	

      data "&&_WEBIN_name&baftn."n;
        INFILE thisfile LRECL=33000 recfm=v dsd;
        /*length %do j=1 %to &totalcol.;
        &&lens&j.
        %end;*/
        ;
        input %do j=1 %to &totalcol.;
        &&cols&j.
        %end;
        ;
      run;
  %put h54s --- FINISH DESERIALISING TABLE &&_WEBIN_name&baftn. ;

    %end;
  %end;

  %put h54s ==> === SUMMARY OF DESERIALISED INPUT TABLES === ;
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
    %put h54s ==> === END SUMMARY ===;
    quit;

%mend;

%macro deserialiseFiles;
  /* 
  _WEBIN_NAME has the name of each parameter for the counterpart spec
  _WEBIN_FILE_COUNT has the total number of files. If 1 then we need no suffix
  */
  %put WEBIN FILE COUNT IS &_WEBIN_FILE_COUNT.;

  %do files = 1 %to &_WEBIN_FILE_COUNT;
    %if &_WEBIN_FILE_COUNT eq 1 %then %do;
        %let baftn=; 
    %end;
    %else %do;
      %let baftn=&files.;
    %end;

     
    %if ("&&&&&&_WEBIN_name&baftn." eq "FILE") %then %do;
      %global bafpn;
      %let bafpn=&baftn.;
      %put program execution is on id &bafpn.;

    %end;
    %else %do;
      %let bafpn=;

      data _null_;
        length spec $32767.;
        length lendef $50.;
        length lenspec $50.;
        spec=scan(symget(symget(cats("_WEBIN_NAME","&baftn."))), 2, '()');
        put spec=;
        colcount=countw(spec, '|');

        do c=1 to colcount;
          lenspec=scan(spec, c, '|');
          select (scan(lenspec, 2, ','));
              when ('num') lendef=cat(upcase(scan(lenspec,1,',')), ' 8.');
              when ('string') lendef=cat(upcase(scan(lenspec,1,',')), " $", scan(lenspec, 3, ','));
          end;
          * length statement specification here ;
          lname=cats('lens', c);
          call symputx(lname, lendef, 'L');
          
          * input statement specification here ;
          indef=upcase(scan(lenspec,1,','));
          pname=cats('cols', c);
          call symputx(pname, indef, 'L');
          output;
        end;
        call symputx('totalcol', colcount);
      run;

      filename thisfile filesrvc "&&_WEBIN_FILEURI&baftn." ;	

      data "&&_WEBIN_name&baftn."n;
        INFILE thisfile LRECL=33000 recfm=v dsd;
        length %do j=1 %to &totalcol.;
        &&lens&j.
        %end;
        ;
        input %do j=1 %to &totalcol.;
        &&cols&j.
        %end;
        ;
      run;
      
	filename thisfile clear;


  
    %end;
  %end;

  %put === SUMMARY OF DESERIALISED INPUT TABLES === ;
    proc sql noprint;
    %do files = 1 %to &_WEBIN_FILE_COUNT;
      %if &_WEBIN_FILE_COUNT eq 1 %then %let baftn=; 
      %else %let baftn=&files.;
      %if &baftn ne &bafpn %then %do;
        describe table "&&_WEBIN_name&baftn."n;
      %end;  
    %end;  
    %put === END SUMMARY ===;
    quit;

%mend;

%macro bafGetDataset(inparam,outlib,outds);

  %*put -placeholder-;
%mend;

%macro bafOutDataset(outputas, outlib, outdsn);

  data _null_;
    file thiscall mod;
    put '"' "&outputas." '" : ';
  run;

  filename thisjson temp;

  proc json out=thisjson; 
    export &outlib..&outdsn. / nosastags;
  run;

  data _null_;
     length data $1;
     INFILE thisjson recfm=n;
     file thiscall  recfm=n mod;
     input data  $char1. @@;
     put data $char1. @@;
  run;

  *  filename wtfdeb '/tmp/adapter_debug.json';
  *
  *  data _null_;
  *     length data $1;
  *     INFILE thiscall recfm=n;
  *     file wtfdeb recfm=n mod;
  *     input data  $char1. @@;
  *     put data $char1. @@;
  *  run;

  filename thisjson clear;

  data _null_;
    file thiscall mod;
    put ',';
  run;
%mend;
  
%macro bafOutSingleMacro(objectName,singleValue);
* Note: Use this with care, not best practice. Not quoted, so always quote string JS variables. 
        It is risky outputting macro vars raw. I personally would not do it.
;
  data _null_;
    file thiscall mod;
    put '"' "&objectName." '" : "' "&singleValue." '",' ;
  run;
* Come back ;
%mend;


    %global _debug;
    %if &_debug = 131 %then %do;
      %let h54sDebuggingMode = 1;
    %end;
    %else %do;
      %let h54sDebuggingMode = 0;
    %end;


%macro bafHeader();
  filename thiscall temp;
  * keep quiet in the log;
  data _null_;
    file thiscall mod;
    * uncomment these if working with v8 SAS/IntrNet broker ;
    *put "Content-type: text/html";
    *put;
    %*hfsCheckDebug;
    %if &_debug = 131 %then %do;
      put "--h54s-data-start--";
    %end;
    put '{';
  run;
* Come back ;
%mend;



%macro bafFooter();
  * keep quiet in the log;
  %if (%symexist(usermessage) = 0) %then %do;
    %let usermessage = blank;
  %end;

  %if (%symexist(logmessage) = 0) %then %do;
    %let logmessage = blank;
  %end;

  %if (%symexist(h54src) = 0) %then %do;
    %let h54src = success;
  %end;

  data _null_;
    file thiscall mod;
    sasdatetime=datetime();
    put '"usermessage" : "' "&usermessage." '",';
    put '"logmessage" : "' "&logmessage." '",';
    put '"requestingUser" : "' "&SYS_COMPUTE_SESSION_OWNER." '",';
    put '"requestingPerson" : "' "&SYS_COMPUTE_SESSION_OWNER." '",';
    put '"executingPid" : ' "&sysjobid." ',';
    put '"sasDatetime" : ' sasdatetime ',';
    put '"status" : "' "&h54src." '"}';
    put;

    %if &_debug = 131 %then %do;
      put "--h54s-data-end--";
    %end;
  run;

  * http://support.sas.com/kb/20/784.html ;

  data _null_;
     length data $1;
     INFILE thiscall recfm=n;
     file _webout  recfm=n mod;
     input data  $char1. @@;
     put data $char1. @@;
  run;
 


* Come back ;

%mend;
