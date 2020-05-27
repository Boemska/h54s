/**********************************************************************************/
/*            This program loads the default values for the usage dashboard       */
/*                                                                                */
/**********************************************************************************/
%let baseDir = /pub/apps/h54s;
%include "&baseDir/sasautos/h54s.sas";

%bafGetDatasets;
resetline;

data _null_;
    set work.data;
    call symput('getmem',memname);
    call symput('getlib',libname);
run;

proc sql;
    * a sample output ;
    create table myoutput as 
      select * from &getlib..&getmem.;
quit;

%bafHeader;
  %bafOutDataset(outputdata, work, myoutput);
%bafFooter;
