var sasResponses = sasResponses || {};

sasResponses.callErrorDebug = `<html>
<title>SASStoredProcess</title>
<body bgcolor="#FFFFFF" text="#000000" link="#0000FF" vlink="#800080" alink="#FF0000">
<div STYLE="text-align:left" />
<br />&gt;&gt;&gt; 0.001 Stored Process Input Parameters:<br />
<pre>_debug = 131
_grafloc = /sasweb/graph
_htcook = bd8d0d9f5d145f2f350149bf5189aede_Cluster=BB410D3AC140D34BC82C0E09E7D70DBA.bd8d0d9f5d145f2f350149bf5189aede_SASServer1_1
_htua = Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.96 Safari/537.36
_program = /ajax/h54s_test/BounceData
_reqencoding = UTF-8
_reqmeth = POST
_rmtaddr = 0:0:0:0:0:0:0:1
_rmthost = 0:0:0:0:0:0:0:1
_service = default
_srvname = apps.boemskats.com
_srvport = 443
_url = /SASStoredProcess/do
_userlocale = en_US
_username = sasdemo
_version = Version 9.4 (Build 506)
data = [{"colName":"test","colType":"string","colLength":4}]
       [{"test":"test"}]
</pre>
﻿--h54s-data-start--
{
"outputdata" : [
{"TEST":"test"}
],
"usermessage" : "blank",
"logmessage" : "This is a test for Bojan",
"errormessage" : "I hope it works now!",
"requestingUser" : "jimdemo",
"requestingPerson" : "sasdemo",
"executingPid" : 17774,
"sasDatetime" : 1809507387.2 ,
"errormessage": "err msg property value",
"status" : "sasError"}

--h54s-data-end--
</u><div style="text-align:left">
<hr /><h2>SAS Log</h2>
<pre>1                                                                                                                        The SAS System                                                                                              08:56 Thursday, May 4, 2017

<font color=blue>NOTE: Copyright (c) 2002-2012 by SAS Institute Inc., Cary, NC, USA.
NOTE: SAS (r) Proprietary Software 9.4 (TS1M3 MBCS3170)
      Licensed to BOEMSKA TECHNOLOGY SOLUTIONS  - PARTNER, Site 70188871.
NOTE: This session is executing on the Linux 3.10.0-327.10.1.el7.x86_64 (LIN X64) platform.
</font>


<font color=blue>NOTE: Additional host information:

 Linux LIN X64 3.10.0-327.10.1.el7.x86_64 #1 SMP Tue Feb 16 17:03:50 UTC 2016 x86_64 CentOS Linux release 7.2.1511 (Core)

</font>You are running SAS 9. Some SAS 8 files will be automatically converted
by the V9 engine; others are incompatible.  Please see
http://support.sas.com/rnd/migration/planning/platform/64bit.html

PROC MIGRATE will preserve current SAS file attributes and is
recommended for converting all your SAS libraries from any
SAS 8 release to SAS 9.  For details and examples, please see
http://support.sas.com/rnd/migration/index.html


This message is contained in the SAS news file, and is presented upon
initialization.  Edit the file "news" in the "misc/base" directory to
display site-specific news and information in the program log.
The command line option "-nonews" will prevent this display.




<font color=blue>NOTE: SAS Initialization used (Total process time):
      real time           0.00 seconds
      cpu time            0.01 seconds

NOTE: The autoexec file, /pub/config/Lev1/SASApp/StoredProcessServer/autoexec.sas, was executed at server initialization.
</font>
&gt;&gt;&gt; SAS Macro Variables:

 DATA=[{"colName":"test","colType":"string","colLength":4}]
 DATA0=2
 DATA1=[{"colName":"test","colType":"string","colLength":4}]
 DATA2=[{"test":"test"}]
 DATA_COUNT=2
 ESMACTIVE=           1
 ESMAUTOS=
 ESMBASEDIR=/pub/esm/esm-agent
 ESMCHILDSESSION=           0
 ESMEVENTS=/pub/esm/esm-agent/events/apps
 ESMGUID=177741493307382
 ESMJOBNAME=interactive
 ESMJOBUUID=177741493307382
 ESMLRECL=32767
 ESMMULTIBRIDGEPORT=8611
 ESMNODENAME=apps
 ESMNOTES=NOTES
 ESMPARAMETERSTRING=           0
 ESMSESSIONNAME=Lev1_SASApp

 ESMSESSIONTYPE=STP

 ESMSILENCE=0
 ESMSOURCE=NOSOURCE
 ESMSOURCE2=SOURCE2
 SYSDBMSG=
 SYSDBRC=0
 _APSLIST=_srvname,_rmthost,_htcook,_username,_srvport,_reqmeth,_debug,data,data0,data1,data2,data_count,_service,_htua,_grafloc,_version,_url,_rmtaddr,_reqencoding,_userlocale,_program,_result,_
     metaperson,_metauser,_metafolder,_client,_SECUREUSERNAME
 _CLIENT=StoredProcessService 9.4; JVM 1.7.0_76; Linux (amd64) 3.10.0-327.10.1.el7.x86_64
 _DEBUG=131
 _GRAFLOC=/sasweb/graph
 _HTCOOK=bd8d0d9f5d145f2f350149bf5189aede_Cluster=BB410D3AC140D34BC82C0E09E7D70DBA.bd8d0d9f5d145f2f350149bf5189aede_SASServer1_1
 _HTUA=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.96 Safari/537.36
 _METAFOLDER=/AJAX/h54s_test/
 _METAPERSON=sasdemo
 _METAUSER=jimdemo
 _PROGRAM=/AJAX/h54s_test/bounceData
 _REPLAY="&amp;_URL?_sessionid=9D707DE0-5EC9-B04D-8AED-D06B7FF2C43E&amp;_program=replay&amp;_entry=&amp;_TMPCAT.."
 _REQENCODING=UTF-8
 _REQMETH=POST
 _RESULT=STREAM
 _RMTADDR=0:0:0:0:0:0:0:1
 _RMTHOST=0:0:0:0:0:0:0:1
 _SECUREUSERNAME=jimdemo
 _SERVICE=default
 _SRVNAME=apps.boemskats.com
 _SRVPORT=443
 _TMPCAT=APSWORK.TCAT0641
 _URL=/SASStoredProcess/do
 _USERLOCALE=en_US
 _USERNAME=sasdemo
 _VERSION=Version 9.4 (Build 506)

<font color=blue>NOTE: %INCLUDE (level 1) file /pub/esm/esm-agent/sasautos/startstp.sas is file /pub/esm/esm-agent/sasautos/startstp.sas.
</font>3         +%esmtag(&amp;_METAUSER., User: &lt;b&gt;&amp;_METAUSER.&lt;/b&gt;&lt;br&gt;Program: &lt;b&gt;&amp;_PROGRAM.&lt;/b&gt;, #EEEEEE);
<font color=blue>NOTE: %INCLUDE (level 1) ending.
NOTE: %INCLUDE (level 1) file /pub/apps/devtest/bounceData.sas is file /pub/apps/devtest/bounceData.sas.
</font>5         +/**********************************************************************************/
6         +/*            This program loads the default values for the usage dashboard       */
7         +/*                                                                                */
8         +/**********************************************************************************/
9         +%let baseDir = /pub/apps/devtest;
10        +/* changed path below from &amp;basedir (Allan)*/
11        +%include "/pub/programs/Allianz-backend/init/h54s.sas";
<font color=blue>NOTE: %INCLUDE (level 2) file /pub/programs/Allianz-backend/init/h54s.sas is file /pub/programs/Allianz-backend/init/h54s.sas.
</font>12        +/*******************************************************************************
13        + * Boemska HTML5 Data Adapter for SAS v3.1  http://github.com/Boemska/h54s     *
14        + *    Copyright (C) 2015 Boemska Ltd.       http://boemskats.com/h54s          *
15        + *******************************************************************************
16        + * This program is free software: you can redistribute it and/or modify it
17        + * under the terms of the GNU General Public License as published by the Free
18        + * Software Foundation, either version 3 of the License, or (at your option)
19        + * any later version.
20        + *
21        + * This program is distributed in the hope that it will be useful, but WITHOUT
22        + * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
23        + * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
24        + * more details.
25        + *
26        + * You should have received a copy of the GNU General Public License along with
27        + * this program.  If not, see &lt;http://www.gnu.org/licenses/&gt;.
28        + *
29        + *                               VERSION HISTORY
30        + *
31        + *     Date      Version                        Notes
32        + * ------------ --------- ----------------------------------------------------
33        + *  Oct 2012     1.0       Deserialisation with no support from the front end
34        + *                         making 3 passes to generate metadata at back end.
35        + *                         Entirely SAS Macro based parser.
36        + *
37        + *  Sep 2013     2.0       Rewritten with a Javascript-based Table Metadata
                                                                                          The SAS System

38        + *                         generator. Down to 1 pass. 2.5x increase in
39        + *                         performance.
40        + *
41        + *  Mar 2014     3.0       Almost a complete rewrite of the parser, now using
42        + *                         PRXPARSE and PROC FORMAT. 40-60x increase in
43        + *                         performance. (with thanks to Hadley Christoffels)
44        + *
45        + *  Dec 2014     3.1       Moving entirely away from Macro-based processing
46        + *                         to avoid quoting issues, partial rw to use SYMGET
47        + *                         and data step.   (wih thanks to Prajwal Shetty D)
48        + *
49        + *  Dec 2015     3.2       Changed _WEBOUT to be variable, added hfsErrorCheck
50        + *                         and errorchecking in hfsGet and hfsOut to enable
51        + *                         processing to be stopped with unexpected input
52        + *
53        + *  Apr 2017     3.3       Added errormessage attribute to provide a channel
54        + *                         for SAS developers to send custom error messages to
55        + *                         the front end
56        + *
57        + *          LATEST VERSION ALWAYS AVAILABLE ON github.com/Boemska/h54s
58        + *
59        + * Macro Quick Reference:
60        + * =====================
61        + *
62        + * %hfsGetDataset(jsonvarname, outdset);
63        + *      This macro deserialises a JavaScript data object into a SAS table.
64        + *        jsonvarname:  the name given to the table array from the front end,
65        + *                      coresponding to macroName in the
66        + *                      h54s.Tables(tableArray, macroName) example
67        + *        outdset:      the name of the target dataset that the tableArray is
68        + *                      to be deserialised into
69        + *
70        + * %hfsHeader;
71        + *      This macro prepares the output stream for data object output.
72        + *      Conceptually similar to %STPBEGIN.
73        + *
74        + * %hfsOutDataset(objectName, libn, dsn);
75        + *      This macro serialises a SAS dataset to a JavaScript data object.
                                                                                          The SAS System

76        + *        objectName:   the name of the target JS object that the table will be
77        + *                      serialised into
78        + *        libn:         the libname of the source table to be serialised
79        + *        dsn:          the dataset name of the source table to be serialised
80        + *
81        + * %hfsFooter;
82        + *      This macro provides some standard attributes and then closes the
83        + *      output stream for data objects. Counterpart to %hfsHeader.
84        + *      Conceptually similar to %STPEND.
85        + *
86        + * The other macros defined here are still in development, and although
87        + * useful they are not complete and should be used with caution.
88        + *
89        + */
90        +
91        +%GLOBAL h54sQuiet h54sDebug h54ssource h54ssource2 h54slrecl h54snotes h54starget;
92        +
93        +* to enable quiet mode (minimal log output) set variable to blank
94        +  otherwise set variable to *. See around 10 lines below for what it does
95        +;
96        +%let h54sQuiet = ;
97        +
98        +* to enable debug log output set this variable to blank
99        +  otherwise set variable to *
100       +;
101       +%let h54sDebug = *;
102       +
103       +%&amp;h54sDebug.put H54S Debug Mode is Enabled;
104       +%&amp;h54sQuiet.put H54S Quiet Mode is Enabled;
H54S Quiet Mode is Enabled
105       +
106       +
107       +* This macro stores the current values for some of the log level system
108       +  options so that they can be restored afte processing is complete. Controlled
109       +  by the h54sQuiet macro var above ;
110       +%macro hfsQuietenDown;
111       +  %&amp;h54sQuiet.let h54ssource=%sysfunc(getoption(source));
112       +  %&amp;h54sQuiet.let h54ssource2=%sysfunc(getoption(source2));
                                                                                          The SAS System

113       +  %&amp;h54sQuiet.let h54slrecl=%sysfunc(getoption(lrecl));
114       +  %&amp;h54sQuiet.let h54snotes=%sysfunc(getoption(notes));
115       +  &amp;h54sQuiet.options nosource nosource2 nonotes;
116       +%mend;
117       +
118       +%macro hfsQuietenUp;
119       +  &amp;h54sQuiet.options &amp;h54ssource &amp;h54ssource2 lrecl=&amp;h54slrecl &amp;h54snotes;
120       +%mend;
121       +
122       +
123       +* Go quiet and avoid all the garbage in the log ;
124       +%hfsQuietenDown;
h54s ==&gt; TARGET is  _WEBOUT
********************************
GLOBAL BASEDIR /pub/apps/devtest
GLOBAL DATA [{colName:test,colType:string,colLength:4}]
GLOBAL DATA0 2
GLOBAL DATA1 [{colName:test,colType:string,colLength:4}]
GLOBAL DATA2 [{test:test}]
GLOBAL DATA_COUNT 2
GLOBAL H54SDEBUG *
GLOBAL H54SDEBUGGINGMODE 0
GLOBAL H54SLRECL 32000
GLOBAL H54SNOTES NONOTES
GLOBAL H54SQUIET
GLOBAL H54SSOURCE NOSOURCE
GLOBAL H54SSOURCE2 NOSOURCE2
GLOBAL H54STARGET _WEBOUT
GLOBAL _APSLIST
_srvname,_rmthost,_htcook,_username,_srvport,_reqmeth,_debug,data,data0,data1,data2,data_count,_service,_htua,_grafloc,_version,_url,_rmtaddr,_reqencoding,_userlocale,_program,_result,_metaperson
,_metauser,_metafolder,_client,_SECUREUSERNAME
GLOBAL _CLIENT StoredProcessService 9.4 JVM 1.7.0_76 Linux (amd64) 3.10.0-327.10.1.el7.x86_64
GLOBAL _DEBUG 131
GLOBAL _GRAFLOC /sasweb/graph
GLOBAL _HTCOOK bd8d0d9f5d145f2f350149bf5189aede_Cluster=BB410D3AC140D34BC82C0E09E7D70DBA.bd8d0d9f5d145f2f350149bf5189aede_SASServer1_1
GLOBAL _HTUA Mozilla/5.0 (X11 Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.96 Safari/537.36
GLOBAL _METAFOLDER /AJAX/h54s_test/
GLOBAL _METAPERSON sasdemo
                                                                                          The SAS System

GLOBAL _METAUSER jimdemo
GLOBAL _PROGRAM /AJAX/h54s_test/bounceData
GLOBAL _REPLAY "&amp;_URL?_sessionid=9D707DE0-5EC9-B04D-8AED-D06B7FF2C43E_program=replay_entry=&amp;_TMPCAT.."
GLOBAL _REQENCODING UTF-8
GLOBAL _REQMETH POST
GLOBAL _RESULT STREAM
GLOBAL _RMTADDR 0:0:0:0:0:0:0:1
GLOBAL _RMTHOST 0:0:0:0:0:0:0:1
GLOBAL _SECUREUSERNAME jimdemo
GLOBAL _SERVICE default
GLOBAL _SRVNAME apps.boemskats.com
GLOBAL _SRVPORT 443
GLOBAL _TMPCAT APSWORK.TCAT0641
GLOBAL _URL /SASStoredProcess/do
GLOBAL _USERLOCALE en_US
GLOBAL _USERNAME sasdemo
GLOBAL _VERSION Version 9.4 (Build 506)
GLOBAL ESMACTIVE            1
GLOBAL ESMAUTOS
GLOBAL ESMBASEDIR /pub/esm/esm-agent
GLOBAL ESMCHILDSESSION            0
GLOBAL ESMEVENTS /pub/esm/esm-agent/events/apps
GLOBAL ESMGUID 177741493307382
GLOBAL ESMJOBNAME interactive
GLOBAL ESMJOBUUID 177741493307382
GLOBAL ESMLRECL 32767
GLOBAL ESMMULTIBRIDGEPORT 8611
GLOBAL ESMNODENAME apps
GLOBAL ESMNOTES NOTES
GLOBAL ESMPARAMETERSTRING            0
GLOBAL ESMSESSIONNAME Lev1_SASApp

GLOBAL ESMSESSIONTYPE STP

GLOBAL ESMSILENCE 0
GLOBAL ESMSOURCE NOSOURCE
GLOBAL ESMSOURCE2 SOURCE2
GLOBAL SYSDBMSG
                                                                                          The SAS System

GLOBAL SYSDBRC 0
AUTOMATIC AFDSID 0
AUTOMATIC AFDSNAME
AUTOMATIC AFLIB
AUTOMATIC AFSTR1
AUTOMATIC AFSTR2
AUTOMATIC FSPBDV
AUTOMATIC SYSADDRBITS 64
AUTOMATIC SYSBUFFR
AUTOMATIC SYSCC 0
AUTOMATIC SYSCHARWIDTH 1
AUTOMATIC SYSCMD
AUTOMATIC SYSDATASTEPPHASE
AUTOMATIC SYSDATE 04MAY17
AUTOMATIC SYSDATE9 04MAY2017
AUTOMATIC SYSDAY Thursday
AUTOMATIC SYSDEVIC
AUTOMATIC SYSDMG 0
AUTOMATIC SYSDSN         _NULL_
AUTOMATIC SYSENCODING utf-8
AUTOMATIC SYSENDIAN LITTLE
AUTOMATIC SYSENV BACK
AUTOMATIC SYSERR 0
AUTOMATIC SYSERRORTEXT
AUTOMATIC SYSFILRC 1
AUTOMATIC SYSHOSTINFOLONG Linux LIN X64 3.10.0-327.10.1.el7.x86_64 #1 SMP Tue Feb 16 17:03:50 UTC 2016 x86_64 CentOS Linux release 7.2.1511 (Core)
AUTOMATIC SYSHOSTNAME apps
AUTOMATIC SYSINDEX 8
AUTOMATIC SYSINFO 0
AUTOMATIC SYSJOBID 17774
AUTOMATIC SYSLAST _NULL_
AUTOMATIC SYSLCKRC 0
AUTOMATIC SYSLIBRC 0
AUTOMATIC SYSLOGAPPLNAME
AUTOMATIC SYSMACRONAME
AUTOMATIC SYSMAXLONG 9007199254740992
AUTOMATIC SYSMENV S
AUTOMATIC SYSMSG
                                                                                          The SAS System

AUTOMATIC SYSNCPU 4
AUTOMATIC SYSNOBS 0
AUTOMATIC SYSODSESCAPECHAR
AUTOMATIC SYSODSGRAPHICS 0
AUTOMATIC SYSODSPATH  WORK.TEMPLAT(UPDATE) SASUSER.TEMPLAT(READ) SASHELP.TMPLMST(READ)
AUTOMATIC SYSPARM
AUTOMATIC SYSPRINTTOLOG
AUTOMATIC SYSPRINTTOLIST
AUTOMATIC SYSPROCESSID 41DAF6B90EC04DC640F79CB000000000
AUTOMATIC SYSPROCESSMODE SAS Stored Process Server
AUTOMATIC SYSPROCESSNAME STPX_TSK
AUTOMATIC SYSPROCNAME
AUTOMATIC SYSRC 0
AUTOMATIC SYSSCP LIN X64
AUTOMATIC SYSSCPL Linux
AUTOMATIC SYSSITE 70188871
AUTOMATIC SYSSIZEOFLONG 8
AUTOMATIC SYSSIZEOFPTR 8
AUTOMATIC SYSSIZEOFUNICODE 4
AUTOMATIC SYSSTARTID
AUTOMATIC SYSSTARTNAME
AUTOMATIC SYSTCPIPHOSTNAME apps.boemskats.com
AUTOMATIC SYSTIME 08:56
AUTOMATIC SYSTIMEZONE
AUTOMATIC SYSTIMEZONEIDENT
AUTOMATIC SYSTIMEZONEOFFSET -14400
AUTOMATIC SYSUSERID jimsrv
AUTOMATIC SYSVER 9.4
AUTOMATIC SYSVLONG 9.04.01M3P062415
AUTOMATIC SYSVLONG4 9.04.01M3P06242015
AUTOMATIC SYSWARNINGTEXT
MLOGIC(HFSGETDATASET):  Beginning execution.
MLOGIC(HFSGETDATASET):  Parameter JSONVARNAME has value data
MLOGIC(HFSGETDATASET):  Parameter OUTDSET has value work.tblspec
MLOGIC(HFSQUIETENDOWN):  Beginning execution.
MLOGIC(HFSQUIETENDOWN):  Ending execution.
MLOGIC(HFSGETDATASET):  %IF condition (%symexist(&amp;jsonvarname.0) = 0) is FALSE
MLOGIC(HFSGETDATASET):  %IF condition (%length(&amp;&amp;&amp;jsonvarname.2) &lt; 4) is FALSE
                                                                                          The SAS System

MLOGIC(HFSGETDATASET):  %DO loop beginning; index variable JSONPARSELOOP; start value is 1; stop value is 2; by value is 1.
MLOGIC(HFSGETDATASET):  %IF condition &amp;jsonparseloop. = 1 is TRUE
MLOGIC(HFSGETDATASET):  %DO loop index variable JSONPARSELOOP is now 2; loop will iterate again.
MLOGIC(HFSGETDATASET):  %IF condition &amp;jsonparseloop. = 1 is FALSE
MLOGIC(HFSGETDATASET):  %IF condition &amp;string_colnames. ^= is TRUE
MLOGIC(HFSGETDATASET):  %IF condition &amp;num_colnames. ^= is FALSE
MLOGIC(HFSGETDATASET):  %IF condition &amp;date_colnames. ^= is FALSE
MLOGIC(HFSGETDATASET):  %IF condition &amp;string_colnames. ^= is TRUE
MLOGIC(HFSGETDATASET):  %IF condition &amp;num_colnames. ^= is FALSE
MLOGIC(HFSGETDATASET):  %IF condition &amp;date_colnames. ^= is FALSE
MLOGIC(HFSGETDATASET):  %DO loop index variable JSONPARSELOOP is now 3; loop will not iterate again.
MLOGIC(HFSGETDATASET):  %DO loop beginning; index variable SETLOOP; start value is 2; stop value is 2; by value is 1.
MLOGIC(HFSGETDATASET):  %DO loop index variable SETLOOP is now 3; loop will not iterate again.
MLOGIC(HFSQUIETENUP):  Beginning execution.
MLOGIC(HFSQUIETENUP):  Ending execution.
MLOGIC(HFSGETDATASET):  Ending execution.
MLOGIC(HFSHEADER):  Beginning execution.
MLOGIC(HFSQUIETENDOWN):  Beginning execution.
MLOGIC(HFSQUIETENDOWN):  Ending execution.
MLOGIC(HFSCHECKDEBUG):  Beginning execution.
MLOGIC(HFSQUIETENDOWN):  Beginning execution.
MLOGIC(HFSQUIETENDOWN):  Ending execution.
MLOGIC(HFSCHECKDEBUG):  %IF condition %symExist(_debug) is TRUE
MLOGIC(HFSCHECKDEBUG):  %IF condition &amp;_debug = 131 is TRUE
MLOGIC(HFSCHECKDEBUG):  %LET (variable name is H54SDEBUGGINGMODE)
MLOGIC(HFSQUIETENUP):  Beginning execution.
MLOGIC(HFSQUIETENUP):  Ending execution.
MLOGIC(HFSCHECKDEBUG):  Ending execution.
MLOGIC(HFSHEADER):  %IF condition &amp;h54sDebuggingMode = 1 is TRUE
MLOGIC(HFSQUIETENUP):  Beginning execution.
MLOGIC(HFSQUIETENUP):  Ending execution.
MLOGIC(HFSHEADER):  Ending execution.
MLOGIC(HFSOUTDATASET):  Beginning execution.
MLOGIC(HFSOUTDATASET):  Parameter OBJECTNAME has value outputdata
MLOGIC(HFSOUTDATASET):  Parameter LIBN has value work
MLOGIC(HFSOUTDATASET):  Parameter DSN has value myoutput
MLOGIC(HFSQUIETENDOWN):  Beginning execution.
MLOGIC(HFSQUIETENDOWN):  Ending execution.
                                                                                          The SAS System

MLOGIC(HFSOUTDATASET):  %IF condition (%sysfunc(exist(&amp;libn..&amp;dsn))=0 and %sysfunc(exist(&amp;libn..&amp;dsn,VIEW))=0) is FALSE
MLOGIC(HFSOUTDATASET):  %DO loop beginning; index variable COLNO; start value is 1; stop value is 1; by value is 1.
MLOGIC(HFSOUTDATASET):  %IF condition &amp;&amp;&amp;type&amp;colNo = 2 is TRUE
MLOGIC(HFSOUTDATASET):  %IF condition &amp;&amp;&amp;name&amp;colNo ne &amp;lastCol is FALSE
MLOGIC(HFSOUTDATASET):  %DO loop index variable COLNO is now 2; loop will not iterate again.
MLOGIC(HFSOUTDATASET):  %DO loop beginning; index variable COLNO; start value is 1; stop value is 1; by value is 1.
MLOGIC(HFSOUTDATASET):  %IF condition &amp;totalCols = 1 is TRUE
MLOGIC(HFSOUTDATASET):  %IF condition &amp;&amp;&amp;type&amp;colNo = 2 is TRUE
MLOGIC(HFSOUTDATASET):  %DO loop index variable COLNO is now 2; loop will not iterate again.
MLOGIC(HFSQUIETENUP):  Beginning execution.
MLOGIC(HFSQUIETENUP):  Ending execution.
MLOGIC(HFSOUTDATASET):  Ending execution.
MLOGIC(HFSFOOTER):  Beginning execution.
MLOGIC(HFSQUIETENDOWN):  Beginning execution.
MLOGIC(HFSQUIETENDOWN):  Ending execution.
MLOGIC(HFSFOOTER):  %IF condition (%symexist(usermessage) = 0) is TRUE
MLOGIC(HFSFOOTER):  %LET (variable name is USERMESSAGE)
MLOGIC(HFSFOOTER):  %IF condition (%symexist(logmessage) = 0) is FALSE
MLOGIC(HFSFOOTER):  %IF condition (%symexist(errormessage) = 0) is FALSE
MLOGIC(HFSFOOTER):  %IF condition (%symexist(h54src) = 0) is TRUE
MLOGIC(HFSFOOTER):  %LET (variable name is H54SRC)
MLOGIC(HFSFOOTER):  %IF condition &amp;h54sDebuggingMode = 1 is TRUE
MLOGIC(HFSQUIETENUP):  Beginning execution.
MLOGIC(HFSQUIETENUP):  Ending execution.
MLOGIC(HFSFOOTER):  Ending execution.
</pre>

</div>
</u><div style="text-align:left"><p /><hr />
This request took 0.28 seconds of real time.
</div>
</body></html>

`
