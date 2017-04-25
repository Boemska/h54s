var sasResponses = sasResponses || {};

sasResponses.callFail = `{
"outputdata" : [],
"usermessage" : "blank",
"logmessage" : "ERROR - Output table work.myoutput was not found",
"requestingUser" : "jimdemo",
"requestingPerson" : "sasdemo",
"executingPid" : 2397,
"sasDatetime" : 1808640797.4 ,
"status" : "outputTableNotFound"}

<h1>Stored Process Error</h1><h3>This request completed with errors.</h3>
<script type="text/javascript">/*<![CDATA[*/
function SAS_toggleLog() {
  var button, content, SASLogDisplay;
  button        = document.getElementById("SASLogbutton");
  content       = document.getElementById("SASLog");
  SASLogDisplay = content.style.display;
  if (SASLogDisplay == "none") {
    content.style.display = "inline";
    button.value="Hide SAS Log";
  }
  else {
    content.style.display = "none";
    button.value="Show SAS Log";
  }
}
/*]]>*/</script>
<form>
  <input id="SASLogbutton" class="button" type="button" onclick="SAS_toggleLog();" value="Show SAS Log" />
</form>
<div id="SASLog" style="display:none; text-align:left;">
<h2>SAS Log</h2>
<pre>1                                                                                                                        The SAS System                                                                                             08:13 Monday, April 24, 2017

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
      real time           0.01 seconds
      cpu time            0.01 seconds

NOTE: The autoexec file, /pub/config/Lev1/SASApp/StoredProcessServer/autoexec.sas, was executed at server initialization.
</font>
&gt;&gt;&gt; SAS Macro Variables:

 DATA=[{"colName":"libname","colType":"string","colLength":4},{"colName":"memname","colType":"string","colLength":9}]
 DATA0=2
 DATA1=[{"colName":"libname","colType":"string","colLength":4},{"colName":"memname","colType":"string","colLength":9}]
 DATA2=[{"libname":"WORK","memname":"CHOSENLIB"}]
 DATA_COUNT=2
 ESMACTIVE=           1
 ESMAUTOS=
 ESMBASEDIR=/pub/esm/esm-agent
 ESMCHILDSESSION=           0
 ESMEVENTS=/pub/esm/esm-agent/events/apps
 ESMGUID=           0
 ESMJOBNAME=interactive
 ESMJOBUUID=           0
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
 _APSLIST=_srvname,_rmthost,_htcook,_username,_srvport,_reqmeth,_debug,data,data0,data1,data2,data_count,_webin_file_count,_service,_htua,_grafloc,_version,_url,_rmtaddr,_reqencoding,_userlocale,
     _program,_webin_stream,_webin_stream_count,_result,_metaperson,_metauser,_metafolder,_client,_SECUREUSERNAME
 _CLIENT=StoredProcessService 9.4; JVM 1.7.0_76; Linux (amd64) 3.10.0-327.10.1.el7.x86_64
 _DEBUG=0
 _GRAFLOC=/sasweb/graph
 _HTCOOK=bd8d0d9f5d145f2f350149bf5189aede_Cluster=C12EAB9EE99A861EBC8EC09BFCC53467.bd8d0d9f5d145f2f350149bf5189aede_SASServer1_1
 _HTUA=Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.81 Safari/537.36
 _METAFOLDER=/AJAX/h54s_test/
 _METAPERSON=sasdemo
 _METAUSER=jimdemo
 _PROGRAM=/AJAX/h54s_test/getData
 _REPLAY="&amp;_URL?_sessionid=8BA20D3D-60E9-584C-A2AD-C6DEDED52104&amp;_program=replay&amp;_entry=&amp;_TMPCAT.."
 _REQENCODING=UTF-8
 _REQMETH=POST
 _RESULT=STREAM
 _RMTADDR=0:0:0:0:0:0:0:1
 _RMTHOST=0:0:0:0:0:0:0:1
 _SECUREUSERNAME=jimdemo
 _SERVICE=default
 _SRVNAME=apps.boemskats.com
 _SRVPORT=443
 _TMPCAT=APSWORK.TCAT2868
 _URL=/SASStoredProcess/do
 _USERLOCALE=en_US
 _USERNAME=sasdemo
 _VERSION=Version 9.4 (Build 506)
 _WEBIN_FILE_COUNT=0
 _WEBIN_STREAM=
 _WEBIN_STREAM_COUNT=1

<font color=blue>NOTE: %INCLUDE (level 1) file /pub/esm/esm-agent/sasautos/startstp.sas is file /pub/esm/esm-agent/sasautos/startstp.sas.
</font>3         +%esmtag(&amp;_METAUSER., User: &lt;b&gt;&amp;_METAUSER.&lt;/b&gt;&lt;br&gt;Program: &lt;b&gt;&amp;_PROGRAM.&lt;/b&gt;, #EEEEEE);
<font color=blue>NOTE: %INCLUDE (level 1) ending.
NOTE: %INCLUDE (level 1) file /pub/apps/devtest/getData.sas is file /pub/apps/devtest/getData.sas.
</font>5         +/**********************************************************************************/
6         +/*            This program loads the default values for the usage dashboard       */
7         +/*                                                                                */
8         +/**********************************************************************************/
9         +%let baseDir = /pub/apps/devtest;
10        +%include "&amp;baseDir/h54s.sas";
<font color=blue>NOTE: %INCLUDE (level 2) file /pub/apps/devtest/h54s.sas is file /pub/apps/devtest/h54s.sas.
</font>11        +/*******************************************************************************
12        + * Boemska HTML5 Data Adapter for SAS v3.1  http://github.com/Boemska/h54s     *
13        + *    Copyright (C) 2015 Boemska Ltd.       http://boemskats.com/h54s          *
14        + *******************************************************************************
15        + * This program is free software: you can redistribute it and/or modify it
16        + * under the terms of the GNU General Public License as published by the Free
17        + * Software Foundation, either version 3 of the License, or (at your option)
18        + * any later version.
19        + *
20        + * This program is distributed in the hope that it will be useful, but WITHOUT
21        + * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
22        + * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
23        + * more details.
24        + *
25        + * You should have received a copy of the GNU General Public License along with
26        + * this program.  If not, see &lt;http://www.gnu.org/licenses/&gt;.
27        + *
28        + *                               VERSION HISTORY
29        + *
30        + *     Date      Version                        Notes
31        + * ------------ --------- ----------------------------------------------------
32        + *  Oct 2012     1.0       Deserialisation with no support from the front end
33        + *                         making 3 passes to generate metadata at back end.
34        + *                         Entirely SAS Macro based parser.
35        + *
36        + *  Sep 2013     2.0       Rewritten with a Javascript-based Table Metadata
37        + *                         generator. Down to 1 pass. 2.5x increase in
                                                                                          The SAS System

38        + *                         performance.
39        + *
40        + *  Mar 2014     3.0       Almost a complete rewrite of the parser, now using
41        + *                         PRXPARSE and PROC FORMAT. 40-60x increase in
42        + *                         performance. (with thanks to Hadley Christoffels)
43        + *
44        + *  Dec 2014     3.1       Moving entirely away from Macro-based processing
45        + *                         to avoid quoting issues, partial rw to use SYMGET
46        + *                         and data step.   (wih thanks to Prajwal Shetty D)
47        + *
48        + *  Dec 2015     3.2       Changed _WEBOUT to be variable, added hfsErrorCheck
49        + *                         and errorchecking in hfsGet and hfsOut to enable
50        + *                         processing to be stopped with unexpected input
51        + *
52        + *          LATEST VERSION ALWAYS AVAILABLE ON github.com/Boemska/h54s
53        + *
54        + * Macro Quick Reference:
55        + * =====================
56        + *
57        + * %hfsGetDataset(jsonvarname, outdset);
58        + *      This macro deserialises a JavaScript data object into a SAS table.
59        + *        jsonvarname:  the name given to the table array from the front end,
60        + *                      coresponding to macroName in the
61        + *                      h54s.Tables(tableArray, macroName) example
62        + *        outdset:      the name of the target dataset that the tableArray is
63        + *                      to be deserialised into
64        + *
65        + * %hfsHeader;
66        + *      This macro prepares the output stream for data object output.
67        + *      Conceptually similar to %STPBEGIN.
68        + *
69        + * %hfsOutDataset(objectName, libn, dsn);
70        + *      This macro serialises a SAS dataset to a JavaScript data object.
71        + *        objectName:   the name of the target JS object that the table will be
72        + *                      serialised into
73        + *        libn:         the libname of the source table to be serialised
74        + *        dsn:          the dataset name of the source table to be serialised
75        + *
                                                                                          The SAS System

76        + * %hfsFooter;
77        + *      This macro closes the output stream for data objects.
78        + *      Counterpart to %hfsHeader. Conceptually similar to %STPEND.
79        + *
80        + * The other macros defined here are still in development, and although
81        + * useful they are not complete and should be used with caution.
82        + *
83        + */
84        +
85        +%GLOBAL h54sQuiet h54sDebug h54ssource h54ssource2 h54slrecl h54snotes h54starget;
86        +
87        +* to enable quiet mode (minimal log output) set variable to blank
88        +  otherwise set variable to *. See around 10 lines below for what it does
89        +;
90        +%let h54sQuiet = * ;
91        +
92        +* to enable debug log output set this variable to blank
93        +  otherwise set variable to *
94        +;
95        +%let h54sDebug = ;
96        +
97        +%&amp;h54sDebug.put H54S Debug Mode is Enabled;
H54S Debug Mode is Enabled
98        +%&amp;h54sQuiet.put H54S Quiet Mode is Enabled;
99        +
100       +
101       +* This macro stores the current values for some of the log level system
102       +  options so that they can be restored afte processing is complete. Controlled
103       +  by the h54sQuiet macro var above ;
104       +%macro hfsQuietenDown;
105       +  %&amp;h54sQuiet.let h54ssource=%sysfunc(getoption(source));
106       +  %&amp;h54sQuiet.let h54ssource2=%sysfunc(getoption(source2));
107       +  %&amp;h54sQuiet.let h54slrecl=%sysfunc(getoption(lrecl));
108       +  %&amp;h54sQuiet.let h54snotes=%sysfunc(getoption(notes));
109       +  &amp;h54sQuiet.options nosource nosource2 nonotes;
110       +%mend;
111       +
112       +%macro hfsQuietenUp;
                                                                                          The SAS System

113       +  &amp;h54sQuiet.options &amp;h54ssource &amp;h54ssource2 lrecl=&amp;h54slrecl &amp;h54snotes;
114       +%mend;
115       +
116       +
117       +* Go quiet and avoid all the garbage in the log ;
118       +%hfsQuietenDown;
119       +
120       +options NOQUOTELENMAX LRECL=32000 spool;
121       +
122       +* check if _WEBOUT exists, if not then this is a test or interactive session ;
123       +
124       +
125       +%macro checkEnvironment;
126       +  %hfsQuietenDown;
127       +  * set this to whatever your test harness is configured to ;
128       +  %let batchOutFile='/tmp/h54sTest.out';
129       +  * could do with a nicer way to check whether _WEBOUT is available ;
130       +  %if (%symexist(_REPLAY) = 0) %then %do;
131       +    %let h54starget=&amp;batchOutFile.;
132       +  %end;
133       +  %else %do;
134       +    %let h54starget=_WEBOUT;
135       +  %end;
136       +  %PUT h54s ==&gt; TARGET is  &amp;h54starget.;
137       +  %hfsQuietenUp;
138       +%mend;
139       +
140       +%checkEnvironment;
h54s ==&gt; TARGET is  _WEBOUT
141       +
142       +* this is where we parse the inward objects ;
143       +%macro hfsGetDataset(jsonvarname, outdset) ;
144       +  * keep quiet in the log;
145       +  %hfsQuietenDown;
146       +
147       +  * check if the jsonvarname sym EXISTS and if not then gracefully quit this macro ;
148       +  %if (%symexist(&amp;jsonvarname.0) = 0) %then %do;
149       +    *abort macro execution and explain why;
                                                                                          The SAS System

150       +    %global logmessage h54src;
151       +    %let logmessage=H54S Exception - Input object &amp;jsonvarname was not found;
152       +    %let h54src=inputTableNotFound;
153       +    %return;
154       +  %end;
155       +
156       +  * check if the array sent over was EMPTY and if so then gracefully quit this macro ;
157       +  %if (%length(%nrbquote(&amp;&amp;&amp;jsonvarname.2)) &lt; 4) %then %do;
158       +    *abort macro execution and explain why;
159       +    %put &amp;&amp;&amp;jsonvarname.2;
160       +    %global logmessage h54src;
161       +    %let logmessage=H54S Exception - Input object &amp;jsonvarname contained no data ;
162       +    %let h54src=inputTableEmpty;
163       +    %return;
164       +  %end;
165       +
166       +
167       +* macvar0 will contain number of data tables and macvar1 onwards contains data structures ;
168       +  %do jsonparseloop = 1 %to &amp;&amp;&amp;jsonvarname.0 ;
169       +    %if &amp;jsonparseloop. = 1 %then %do ;
170       +      data colattribs ;
171       +&amp;h54sDebug.putlog 'H54S: hfsGetDataset(): Passed preliminary checks';
172       +&amp;h54sDebug.putlog 'H54S:   Starting colattribs data step processing';
173       +        length colname $32
174       +               coltype $6
175       +               collength 8
176       +               string_colnames num_colnames date_colnames $32000
177       +               length_statement $32000
178       +               jsonString $32000
179       +               ;
180       +        retain string_colnames num_colnames date_colnames ""
181       +               length_statement ""
182       +               fmtname "$coltype"
183       +               type "c"
184       +               ;
185       +* parse all regular expressions ;
186       +* find rows ;
187       +&amp;h54sDebug.putlog "H54S:   Active element is : &amp;jsonvarname&amp;jsonparseloop. ";
                                                                                          The SAS System

188       +        jsonString =  symget("&amp;jsonvarname&amp;jsonparseloop.");
189       +&amp;h54sDebug.putlog "H54S:   Prxparsing : &amp;jsonvarname&amp;jsonparseloop. ";
190       +        rowregexid = prxparse('/(?&lt;=\{).+?(?=\})/i') ;
191       +        rowstart = 1 ;
192       +        rowstop = length(strip(jsonString)) ;
193       +
194       +        call prxnext(rowregexid, rowstart, rowstop, jsonString, rowpos, rowlen) ;
195       +&amp;h54sDebug.putlog "H54S:   Processing: Metadata Header";
196       +
197       +        do while (rowpos &gt; 0) ;
198       +          currentrow = substr(jsonString, rowpos, rowlen) ;
199       +&amp;h54sDebug.putlog "H54S:     Header Loop: Current row is " currentrow;
200       +          lengthofcurrentrow = length(currentrow);
201       +&amp;h54sDebug.putlog "H54S:     Header Loop: Current row length is " lengthofcurrentrow;
202       +          currentpairnum = 1 ;
203       +          do until (scan(currentrow, currentpairnum, ",") = "") ;
204       +            currentpair = scan(currentrow, currentpairnum, ",");
205       +            varname = strip(compress(scan(currentpair, 1, ":"), '"')) ;
206       +            varvalue = urldecode(strip(compress(scan(currentpair, 2, ":"), '"'))) ;
207       +            if upcase(varname) = "COLNAME" then do ;
208       +&amp;h54sDebug.putlog "H54S:     Header Loop: Column name found: " varvalue;
209       +              colname = upcase(varvalue) ;
210       +            end ;
211       +            else if upcase(varname) = "COLTYPE" then do ;
212       +&amp;h54sDebug.putlog "H54S:     Header Loop: Column type found: " varvalue;
213       +              coltype = varvalue ;
214       +              if upcase(varvalue) = "STRING" then length_prefix = "$" ;
215       +              else length_prefix = "" ;
216       +            end ;
217       +
218       +            else if upcase(varname) = "COLLENGTH" then do ;
219       +&amp;h54sDebug.putlog "H54S:     Header Loop: Column length found: " varvalue;
220       +              collength = input(varvalue, 8.) ;
221       +            end ;
222       +            currentpairnum + 1 ;
223       +          end ;
224       +          if upcase(coltype) = "STRING" then do;
225       +&amp;h54sDebug.putlog "H54S:     Header Loop: Adding " colname " to list of STRINGS";
                                                                                          The SAS System

226       +            string_colnames = catx(" ", string_colnames, colname) ;
227       +          end;
228       +          else if upcase(coltype) = "NUM" then do;
229       +&amp;h54sDebug.putlog "H54S:     Header Loop: Adding " colname " to list of NUMBERS";
230       +            num_colnames = catx(" ", num_colnames, colname) ;
231       +          end;
232       +          else if upcase(coltype) = "DATE" then do;
233       +&amp;h54sDebug.putlog "H54S:     Header Loop: Adding " colname " to list of DATES";
234       +            date_colnames = catx(" ", date_colnames, colname) ;
235       +          end;
236       +          length_statement = catx(" ",length_statement, colname, length_prefix, collength);
237       +          output ;
238       +          call prxnext(rowregexid, rowstart, rowstop, jsonString, rowpos, rowlen) ;
239       +        end ;
240       +        call symputx("string_colnames", string_colnames) ;
241       +        call symputx("num_colnames", num_colnames) ;
242       +        call symputx("date_colnames", date_colnames) ;
243       +        call symputx("length_statement", length_statement) ;
244       +        drop rowregexid rowstart rowstop rowpos rowlen currentrow currentpairnum currentpair
245       +        varname varvalue length_statement length_prefix  string_colnames num_colnames date_colnames ;
246       +&amp;h54sDebug.putlog "H54S:     Header Loop: Finishing DATA step and loading into formats";
247       +      run ;
248       +
249       +      data _null_;
250       +&amp;h54sDebug.putlog "H54S:     After header loop - String cols: &amp;string_colnames.";
251       +&amp;h54sDebug.putlog "H54S:     After header loop - Num cols: &amp;num_colnames.";
252       +&amp;h54sDebug.putlog "H54S:     After header loop - Date cols: &amp;date_colnames.";
253       +      run;
254       +
255       +      proc format library=work cntlin=colattribs (keep = fmtname colname coltype type rename = (colname = start coltype = label)) ;
256       +      run;
257       +
258       +      data _null_;
259       +&amp;h54sDebug.putlog "H54S:     After Format load - HEADER PROCESSING COMPLETE";
260       +      run;
261       +
262       +    %end ;
263       +
                                                                                          The SAS System

264       +/*		The following section processes the non-metadata rows (actual data)
265       +*/
266       +    %else %do ;
267       +      data jsontemptable&amp;jsonparseloop. ;
268       +&amp;h54sDebug.putlog "H54S: Starting data step processing of data macro segments -&gt; Segment # &amp;jsonparseloop.";
269       +        length &amp;length_statement. ;
270       +        length jsonString currentrow currentpair varvalue $32000;
271       +        length coltype $10.;
272       +
273       +        %if &amp;string_colnames. ^= %then %do;
274       +&amp;h54sDebug.putlog "H54S: -&gt; Segment # &amp;jsonparseloop. contains strings";
275       +          array string_colnames{*} &amp;string_colnames. ;
276       +        %end;
277       +        %if &amp;num_colnames. ^= %then %do;
278       +&amp;h54sDebug.putlog "H54S: -&gt; Segment # &amp;jsonparseloop. contains numbers";
279       +          array num_colnames{*} &amp;num_colnames. ;
280       +        %end;
281       +        %if &amp;date_colnames. ^= %then %do;
282       +&amp;h54sDebug.putlog "H54S: -&gt; Segment # &amp;jsonparseloop. contains dates";
283       +          format &amp;date_colnames. datetime20. ;
284       +          array date_colnames{*} &amp;date_colnames. ;
285       +        %end;
286       +
287       +        jsonString = symget("&amp;jsonvarname&amp;jsonparseloop.");
288       +
289       +&amp;h54sDebug.putlog "H54S: -&gt; Segment # &amp;jsonparseloop.: Regular Expression Parsing starts ";
290       +        rowregexid = prxparse('/(?&lt;=\{).+?(?=\})/i') ;
291       +        rowstart = 1 ;
292       +        rowstop = length(strip(jsonString)) ;
293       +        call prxnext(rowregexid, rowstart, rowstop, jsonString, rowpos, rowlen) ;
294       +        do while (rowpos &gt; 0) ;
295       +&amp;h54sDebug.putlog "H54S: -&gt; Segment # &amp;jsonparseloop.: Regular Expression Parsing starts ";
296       +* get current row ;
297       +          currentrow = substr(jsonString, rowpos, rowlen) ;
298       +&amp;h54sDebug.putlog "H54S:  -&gt; Segment # &amp;jsonparseloop.: currentrow =&gt;         " currentrow;
299       +          currentpairnum = 1 ;
300       +          do until (scan(currentrow, currentpairnum, ",") = "") ;
301       +            currentpair = scan(currentrow, currentpairnum, ",") ;
                                                                                          The SAS System

302       +&amp;h54sDebug.putlog "H54S  -&gt; Segment # &amp;jsonparseloop.: assignment: currentpair =&gt;         " currentpair;
303       +            varname = upcase(strip(compress(scan(currentpair, 1, ":"), '"'))) ;
304       +&amp;h54sDebug.putlog "H54S  -&gt; Segment # &amp;jsonparseloop.: assignment: varname =&gt;             " varname;
305       +            varvalue = urldecode(strip(compress(scan(currentpair, 2, ":"), '"'))) ;
306       +&amp;h54sDebug.putlog "H54S  -&gt; Segment # &amp;jsonparseloop.: assignment: varvalue =&gt;            " varvalue;
307       +            coltype = upcase(put(varname, $coltype.)) ;
308       +&amp;h54sDebug.putlog "H54S  -&gt; Segment # &amp;jsonparseloop.: assignment: coltype =&gt;             " coltype;
309       +
310       +/*     Colnum is also used as a flag here - if there is a match it will set to 1, check inner if statements */
311       +/*     As long as colnum is not 1 then the program will loop and search through.                            */
312       +            colnum = 1 ;
313       +            do until  (colnum=1);
314       +              if coltype = "STRING" then  do;
315       +                %if &amp;string_colnames. ^= %then %do;
316       +                  if varname = upcase(vname(string_colnames(colnum))) then do ;
317       +                    string_colnames(colnum) = varvalue ;
318       +&amp;h54sDebug.putlog "H54S  -&gt; Segment # &amp;jsonparseloop.: STRING: Assigned  " varname " in " string_colnames(colnum);
319       +                    colnum = 1 ;
320       +                    leave;
321       +                  end;
322       +                %end;
323       +              end ;
324       +              else if coltype = "NUM" then do;
325       +                %if &amp;num_colnames. ^= %then %do;
326       +                  if varname = upcase(vname(num_colnames(colnum))) then do ;
327       +                    num_colnames(colnum) = input(varvalue, best20.) ;
328       +&amp;h54sDebug.putlog "H54S  -&gt; Segment # &amp;jsonparseloop.: NUM   : Assigned  " varname " in " num_colnames(colnum);
329       +                    colnum = 1 ;
330       +                    leave;
331       +                  end ;
332       +                %end;
333       +              end ;
334       +              else if coltype = "DATE" then do ;
335       +                %if &amp;date_colnames. ^= %then %do;
336       +                  if varname = upcase(vname(date_colnames(colnum))) then do ;
337       +                    date_colnames(colnum) = input(varvalue, 16.) ;
338       +&amp;h54sDebug.putlog "H54S  -&gt; Segment # &amp;jsonparseloop.: DATE  : Assigned  " varname " in " date_colnames(colnum);
339       +                    colnum = 1 ;
                                                                                          The SAS System

340       +                    leave;
341       +                  end ;
342       +                %end;
343       +              end ;
344       +
345       +              colnum + 1 ;
346       +&amp;h54sDebug.putlog "H54S  -&gt; Segment # &amp;jsonparseloop.: Incrementing colnum FROM " colnum;
347       +            end;
348       +&amp;h54sDebug.putlog "H54S  -&gt; Segment # &amp;jsonparseloop.: Incrementing currentpairnum FROM " currentpairnum;
349       +            currentpairnum + 1 ;
350       +          end ;
351       +          output;
352       +          /* set all vars back to missing to prevent retained
353       +             SAS values when parsing incomplete JSON records  */
354       +          call missing (%sysfunc(tranwrd(
355       +            %sysfunc(compbl(
356       +              &amp;string_colnames &amp;num_colnames &amp;date_colnames
357       +            )),%str( ),%str(,))
358       +          ));
359       +          call prxnext(rowregexid, rowstart, rowstop, jsonString, rowpos, rowlen) ;
360       +        end ;
361       +        keep &amp;string_colnames. &amp;num_colnames. &amp;date_colnames. ;
362       +      run ;
363       +    %end ;
364       +  %end ;
365       +
366       +  data &amp;&amp;outdset. ;
367       +    set
368       +    %do setloop = 2 %to &amp;&amp;&amp;jsonvarname.0 ;
369       +      jsontemptable&amp;setloop.
370       +    %end ;
371       +;
372       +  run ;
373       +
374       +  proc datasets library=work nodetails nolist;
375       +    delete jsontemptable: ;
376       +  quit ;
377       +
                                                                                          The SAS System

378       +* Come back ;
379       +%hfsQuietenUp;
380       +%mend ;
381       +
382       +
383       +
384       +* check if we are in debug mode and delimit data with -h54s-- tags ;
385       +%global h54sDebuggingMode;
386       +%let h54sDebuggingMode = 0;
387       +
388       +%macro hfsCheckDebug;
389       +  * keep quiet in the log;
390       +  %hfsQuietenDown;
391       +  %if %symExist(_debug) %then %do;
392       +    %if &amp;_debug = 131 %then %do;
393       +      %let h54sDebuggingMode = 1;
394       +    %end;
395       +  %end;
396       +* Come back ;
397       +%hfsQuietenUp;
398       +%mend;
399       +
400       +
401       +%macro hfsHeader();
402       +  * keep quiet in the log;
403       +  %hfsQuietenDown;
404       +  data _null_;
405       +    file &amp;h54starget.;
406       +    * uncomment these if working with v8 SAS/IntrNet broker ;
407       +    *put "Content-type: text/html";
408       +    *put;
409       +    %hfsCheckDebug;
410       +    %if &amp;h54sDebuggingMode = 1 %then %do;
411       +      put "--h54s-data-start--";
412       +    %end;
413       +    put '{';
414       +  run;
415       +* Come back ;
                                                                                          The SAS System

416       +%hfsQuietenUp;
417       +%mend;
418       +
419       +%macro hfsFooter();
420       +  * keep quiet in the log;
421       +  %hfsQuietenDown;
422       +  %if (%symexist(usermessage) = 0) %then %do;
423       +    %let usermessage = blank;
424       +  %end;
425       +
426       +  %if (%symexist(logmessage) = 0) %then %do;
427       +    %let logmessage = blank;
428       +  %end;
429       +
430       +  %if (%symexist(h54src) = 0) %then %do;
431       +    %let h54src = success;
432       +  %end;
433       +
434       +  data _null_;
435       +    file &amp;h54starget.;
436       +    sasdatetime=datetime();
437       +    put '"usermessage" : "' "&amp;usermessage." '",';
438       +    put '"logmessage" : "' "&amp;logmessage." '",';
439       +    put '"requestingUser" : "' "&amp;_metauser." '",';
440       +    put '"requestingPerson" : "' "&amp;_metaperson." '",';
441       +    put '"executingPid" : ' "&amp;sysjobid." ',';
442       +    put '"sasDatetime" : ' sasdatetime ',';
443       +    put '"status" : "' "&amp;h54src." '"}';
444       +    put;
445       +
446       +    %if &amp;h54sDebuggingMode = 1 %then %do;
447       +      put "--h54s-data-end--";
448       +    %end;
449       +  run;
450       +
451       +* Come back ;
452       +%hfsQuietenUp;
453       +
                                                                                          The SAS System

454       +%mend;
455       +
456       +%macro hfsOutSingleMacro(objectName,singleValue);
457       +* keep quiet in the log;
458       +  %hfsQuietenDown;
459       +* Note: Use this with care, not best practice. Not quoted, so always quote string JS variables.
460       +        It is risky outputting macro vars raw. I personally would not do it.
461       +;
462       +  data _null_;
463       +    file &amp;h54starget.;
464       +    put '"' "&amp;objectName." '" : ' "&amp;singleValue." ',' ;
465       +  run;
466       +* Come back ;
467       +%hfsQuietenUp;
468       +%mend;
469       +
470       +%macro hfsOutDataset(objectName, libn, dsn);
471       +* keep quiet in the log;
472       +  %hfsQuietenDown;
473       +
474       +  * check if the specified dataset / view exists and if not then gracefully quit this macro ;
475       +  %if (%sysfunc(exist(&amp;libn..&amp;dsn))=0 and %sysfunc(exist(&amp;libn..&amp;dsn,VIEW))=0) %then %do;
476       +    *abort macro execution but first make sure there is a message;
477       +    %global logmessage h54src;
478       +    %let logmessage=ERROR - Output table &amp;libn..&amp;dsn was not found;
479       +    %let h54src=outputTableNotFound;
480       +    *output an empty object so that it does not break things ;
481       +    data _null_;
482       +      file &amp;h54starget.;
483       +      put '"' "&amp;objectName." '" : [],';
484       +    run;
485       +    *quit this macro;
486       +    %return;
487       +  %end;
488       +
489       +
490       +  data _null_;
491       +    call symput('qc', '"');
                                                                                          The SAS System

492       +    call symput('pf', "%upcase(&amp;dsn)");
493       +    call symput('dc', '$');
494       +    call symput('dt_', 'dt_');
495       +  run;
496       +
497       +  proc sql noprint;
498       +    create table tempCols as
499       +    select upcase(name) as name, type, length from dictionary.columns
500       +    where upcase(memname)="%upcase(&amp;dsn)" and libname="%upcase(&amp;libn)";
501       +  quit;
502       +
503       +  %let totalCols = &amp;sqlObs;
504       +
505       +  proc sql noprint;
506       +    select trim(name), trim(type), length into :name1-:name999, :type1-:type999, :length1-:length999
507       +    from tempCols;
508       +  quit;
509       +
510       +  * get first and last column names;
511       +
512       +  data tempCols;
513       +    set tempCols end=lastcol;
514       +    if _n_ = 1 then do;
515       +      call symput('firstCol', strip(name));
516       +    end;
517       +    if lastcol then do;
518       +      call symput('lastCol', strip(name));
519       +    end;
520       +  run;
521       +
522       +
523       +  *create the urlencoded view here;
524       +  proc sql noprint;
525       +    create view tempOutputView as
526       +  select
527       +  %do colNo= 1 %to &amp;totalCols;
528       +    %if &amp;&amp;&amp;name&amp;colNo = &amp;lastCol %then %do;
529       +      %if &amp;&amp;&amp;type&amp;colNo = char %then %do;
                                                                                          The SAS System

530       +        urlencode(strip(&amp;&amp;&amp;name&amp;colNo)) as &amp;&amp;&amp;name&amp;colNo length=30000
531       +      %end;
532       +      %else %do;
533       +        &amp;&amp;&amp;name&amp;colNo as &amp;&amp;&amp;name&amp;colNo
534       +      %end;
535       +    %end;
536       +    %else %do;
537       +      %if &amp;&amp;&amp;type&amp;colNo = char %then %do;
538       +        urlencode(strip(&amp;&amp;&amp;name&amp;colNo)) as &amp;&amp;&amp;name&amp;colNo length=30000,
539       +      %end;
540       +      %else %do;
541       +        &amp;&amp;&amp;name&amp;colNo as &amp;&amp;&amp;name&amp;colNo,
542       +      %end;
543       +    %end;
544       +  %end;
545       +
546       +  from &amp;libn..&amp;dsn.
547       +  quit;
548       +
549       +
550       +  *column types have changed so get metadata for output again;
551       +  * TODO: This needs to be changed from dictionary cols to proc datasets
552       +          so that there is an faster option for servers with many preassigned
553       +          DBMS libs etc
554       +  ;
555       +  proc sql noprint;
556       +    create table tempCols as
557       +    select name, type, length from dictionary.columns where memname="TEMPOUTPUTVIEW" and libname = "WORK";
558       +  quit;
559       +
560       +  %let totalCols = &amp;sqlObs;
561       +
562       +  proc sql noprint;
563       +    select trim(name), trim(type), length into :name1-:name999, :type1-:type999, :length1-:length999
564       +    from tempCols;
565       +  quit;
566       +
567       +
                                                                                          The SAS System

568       +  *output to webout ;
569       +  data _null_;
570       +    file &amp;h54starget.;
571       +    put '"' "&amp;objectName." '" : [';
572       +  run;
573       +
574       +  data _null_;
575       +    file &amp;h54starget.;
576       +    set tempOutputView end=lastrec;
577       +    format _all_;
578       +
579       +    %do colNo= 1 %to &amp;totalCols;
580       +      %if &amp;totalCols = 1 %then %do;
581       +        %if &amp;&amp;&amp;type&amp;colNo = char %then %do;
582       +          put '{"' "&amp;&amp;&amp;name&amp;colNo" '":"' &amp;&amp;&amp;name&amp;colNo +(-1) '"}';
583       +          if not lastrec then put ",";
584       +        %end;
585       +      %if &amp;&amp;&amp;type&amp;colNo = num %then %do;
586       +        if &amp;&amp;&amp;name&amp;colNo = . then put '{"' "&amp;&amp;&amp;name&amp;colNo" '":' 'null ' +(-1) '}';
587       +        else put '{"' "&amp;&amp;&amp;name&amp;colNo" '":' &amp;&amp;&amp;name&amp;colNo +(-1) '}';
588       +        if not lastrec then put ",";
589       +        %end;
590       +      %end;
591       +
592       +      %else %if &amp;&amp;&amp;name&amp;colNo = &amp;firstCol %then %do;
593       +        %if &amp;&amp;&amp;type&amp;colNo = char %then %do;
594       +          put '{"' "&amp;&amp;&amp;name&amp;colNo" '":"' &amp;&amp;&amp;name&amp;colNo +(-1) '",';
595       +        %end;
596       +        %if &amp;&amp;&amp;type&amp;colNo = num %then %do;
597       +          if &amp;&amp;&amp;name&amp;colNo = . then put '{"' "&amp;&amp;&amp;name&amp;colNo" '":' 'null ' +(-1) ',';
598       +          else put '{"' "&amp;&amp;&amp;name&amp;colNo" '":' &amp;&amp;&amp;name&amp;colNo +(-1) ',';
599       +        %end;
600       +      %end;
601       +
602       +      %else %if &amp;&amp;&amp;name&amp;colNo = &amp;lastCol %then %do;
603       +        %if &amp;&amp;&amp;type&amp;colNo = char %then %do;
604       +          put '"' "&amp;&amp;&amp;name&amp;colNo" '":"' &amp;&amp;&amp;name&amp;colNo +(-1) '"}';
605       +          if not lastrec then put ",";
                                                                                          The SAS System

606       +        %end;
607       +        %if &amp;&amp;&amp;type&amp;colNo = num %then %do;
608       +          if &amp;&amp;&amp;name&amp;colNo = . then put '"' "&amp;&amp;&amp;name&amp;colNo" '":' 'null ' +(-1) '}';
609       +          else put '"' "&amp;&amp;&amp;name&amp;colNo" '":' &amp;&amp;&amp;name&amp;colNo +(-1) '}';
610       +          if not lastrec then put ",";
611       +        %end;
612       +      %end;
613       +
614       +      %else %do;
615       +        %if &amp;&amp;&amp;type&amp;colNo = char %then %do;
616       +          put '"' "&amp;&amp;&amp;name&amp;colNo" '":"' &amp;&amp;&amp;name&amp;colNo +(-1) '",';
617       +        %end;
618       +        %if &amp;&amp;&amp;type&amp;colNo = num %then %do;
619       +          if &amp;&amp;&amp;name&amp;colNo = . then put '"' "&amp;&amp;&amp;name&amp;colNo" '":' 'null ' +(-1) ',';
620       +          else put '"' "&amp;&amp;&amp;name&amp;colNo" '":' &amp;&amp;&amp;name&amp;colNo +(-1) ',';
621       +        %end;
622       +      %end;
623       +    %end;
624       +  run;
625       +
626       +  data _null_;
627       +    file &amp;h54starget.;
628       +    put '],';
629       +  run;
630       +
631       +  * delete the temporary tables ;
632       +  proc datasets library=work nodetails nolist;
633       +    delete tempOutputView tempCols ;
634       +  quit ;
635       +
636       +* Come back ;
637       +%hfsQuietenUp;
638       +%mend;
639       +
640       +
641       +* this macro is a stub that needs further testing with earlier versions of SAS.
642       +  It needs to escape the rest of the program after outputting its message as to
643       +  return a standardised error object
                                                                                          The SAS System

644       +;
645       +%macro hfsErrorCheck;
646       +* keep quiet in the log;
647       +%hfsQuietenDown;
648       +  %if (%symexist(h54src) ne 0) %then %do;
649       +    %if "&amp;h54src" ne "0" %then %do;
650       +      %hfsHeader;
651       +      %hfsFooter;
652       +      ENDSAS;
653       +    %end;
654       +  %end;
655       +
656       +* Come back ;
657       +%hfsQuietenUp;
658       +%mend;
659       +
660       +
661       +%hfsQuietenUp;
<font color=blue>NOTE: %INCLUDE (level 2) ending.
NOTE: %INCLUDE (level 1) resuming.
</font>662       +
663       +/*
664       +%LET DATA=[{"colName":"libname","colType":"string","colLength":7},{"colName":"memname","colType":"string","colLength":5}];
665       +%LET DATA0=2;
666       +%LET DATA1=[{"colName":"libname","colType":"string","colLength":7},{"colName":"memname","colType":"string","colLength":5}];
667       +%LET DATA2=[{"libname":"SASHELP"},{"memname":"CLASS"}];*/
668       +
669       +%hfsGetDataset(data, work.tblspec);
<font color=blue>
</font>H54S: hfsGetDataset(): Passed preliminary checks
H54S:   Starting colattribs data step processing
H54S:   Active element is : data1
H54S:   Prxparsing : data1
H54S:   Processing: Metadata Header
H54S:     Header Loop: Current row is "colName":"libname","colType":"string","colLength":4
H54S:     Header Loop: Current row length is 52
H54S:     Header Loop: Column name found: libname
H54S:     Header Loop: Column type found: string
                                                                                          The SAS System

H54S:     Header Loop: Column length found: 4
H54S:     Header Loop: Adding LIBNAME  to list of STRINGS
H54S:     Header Loop: Current row is "colName":"memname","colType":"string","colLength":9
H54S:     Header Loop: Current row length is 52
H54S:     Header Loop: Column name found: memname
H54S:     Header Loop: Column type found: string
H54S:     Header Loop: Column length found: 9
H54S:     Header Loop: Adding MEMNAME  to list of STRINGS
H54S:     Header Loop: Finishing DATA step and loading into formats
<font color=blue>NOTE: The data set WORK.COLATTRIBS has 2 observations and 7 variables.
NOTE: DATA statement used (Total process time):
      real time           0.02 seconds
      cpu time            0.02 seconds



</font>H54S:     After header loop - String cols: LIBNAME MEMNAME
H54S:     After header loop - Num cols:
H54S:     After header loop - Date cols:
<font color=blue>NOTE: DATA statement used (Total process time):
      real time           0.00 seconds
      cpu time            0.01 seconds


NOTE: Format $COLTYPE has been output.

NOTE: PROCEDURE FORMAT used (Total process time):
      real time           0.00 seconds
      cpu time            0.00 seconds

NOTE: There were 2 observations read from the data set WORK.COLATTRIBS.


</font>H54S:     After Format load - HEADER PROCESSING COMPLETE
<font color=blue>NOTE: DATA statement used (Total process time):
      real time           0.00 seconds
      cpu time            0.01 seconds

</font>                                                                                          The SAS System

<font color=blue>

</font>H54S: Starting data step processing of data macro segments -&gt; Segment # 2
H54S: -&gt; Segment # 2 contains strings
H54S: -&gt; Segment # 2: Regular Expression Parsing starts
H54S: -&gt; Segment # 2: Regular Expression Parsing starts
H54S:  -&gt; Segment # 2: currentrow =&gt;         "libname":"WORK","memname":"CHOSENLIB"
H54S  -&gt; Segment # 2: assignment: currentpair =&gt;         "libname":"WORK"
H54S  -&gt; Segment # 2: assignment: varname =&gt;             LIBNAME
H54S  -&gt; Segment # 2: assignment: varvalue =&gt;            WORK
H54S  -&gt; Segment # 2: assignment: coltype =&gt;             STRING
H54S  -&gt; Segment # 2: STRING: Assigned  LIBNAME  in WORK
H54S  -&gt; Segment # 2: Incrementing currentpairnum FROM 1
H54S  -&gt; Segment # 2: assignment: currentpair =&gt;         "memname":"CHOSENLIB"
H54S  -&gt; Segment # 2: assignment: varname =&gt;             MEMNAME
H54S  -&gt; Segment # 2: assignment: varvalue =&gt;            CHOSENLIB
H54S  -&gt; Segment # 2: assignment: coltype =&gt;             STRING
H54S  -&gt; Segment # 2: Incrementing colnum FROM 2
H54S  -&gt; Segment # 2: STRING: Assigned  MEMNAME  in CHOSENLIB
H54S  -&gt; Segment # 2: Incrementing currentpairnum FROM 2
<font color=blue>NOTE: The data set WORK.JSONTEMPTABLE2 has 1 observations and 2 variables.
NOTE: DATA statement used (Total process time):
      real time           0.01 seconds
      cpu time            0.01 seconds



NOTE: There were 1 observations read from the data set WORK.JSONTEMPTABLE2.
NOTE: The data set WORK.TBLSPEC has 1 observations and 2 variables.
NOTE: DATA statement used (Total process time):
      real time           0.00 seconds
      cpu time            0.00 seconds



NOTE: Deleting WORK.JSONTEMPTABLE2 (memtype=DATA).
NOTE: PROCEDURE DATASETS used (Total process time):
      real time           0.05 seconds
</font>                                                                                          The SAS System

<font color=blue>      cpu time            0.04 seconds


</font>670       +
671       +%hfsErrorCheck;
672       +
673       +data _null_;
674       +    set tblspec;
675       +    call symput('getmem',memname);
676       +    call symput('getlib',libname);
677       +run;
<font color=blue>
NOTE: There were 1 observations read from the data set WORK.TBLSPEC.
NOTE: DATA statement used (Total process time):
      real time           0.00 seconds
      cpu time            0.00 seconds


</font>678       +
679       +proc sql;
680       +    * a sample output ;
681       +    create table myoutput as select * from &amp;getlib..&amp;getmem.;
<strong><font color=red>ERROR: File WORK.CHOSENLIB.DATA does not exist.
</font></strong><font color=blue>NOTE: PROC SQL set option NOEXEC and will continue to check the syntax of statements.
</font>682       +quit;
<font color=blue>NOTE: The SAS System stopped processing this step because of errors.
NOTE: PROCEDURE SQL used (Total process time):
      real time           0.00 seconds
      cpu time            0.01 seconds

</font>683       +
684       +%hfsHeader;
<font color=blue>


NOTE: The file _WEBOUT is:
      UUID=40E2B4EA-4227-3848-B132-CDD5F67865E6,
      HTTP:Content-type=text/html;charset=utf-8
</font>                                                                                          The SAS System

<font color=blue>
NOTE: 1 record was written to the file _WEBOUT.
      The minimum record length was 1.
      The maximum record length was 1.
NOTE: DATA statement used (Total process time):
      real time           0.01 seconds
      cpu time            0.01 seconds


</font>685       +  %hfsOutDataset(outputdata, work, myoutput);
<font color=blue>
NOTE: The file _WEBOUT is:
      UUID=40E2B4EA-4227-3848-B132-CDD5F67865E6,
      HTTP:Content-type=text/html;charset=utf-8

NOTE: 1 record was written to the file _WEBOUT.
      The minimum record length was 18.
      The maximum record length was 18.
NOTE: DATA statement used (Total process time):
      real time           0.00 seconds
      cpu time            0.00 seconds


</font>686       +%hfsFooter;
<font color=blue>
NOTE: The file _WEBOUT is:
      UUID=40E2B4EA-4227-3848-B132-CDD5F67865E6,
      HTTP:Content-type=text/html;charset=utf-8

NOTE: 8 records were written to the file _WEBOUT.
      The minimum record length was 0.
      The maximum record length was 66.
NOTE: DATA statement used (Total process time):
      real time           0.00 seconds
      cpu time            0.01 seconds


NOTE: %INCLUDE (level 1) ending.
</font></pre>

</div><!-- SASLOG -->
</body></html>
`
