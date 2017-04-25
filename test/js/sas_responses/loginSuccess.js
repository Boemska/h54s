var sasResponses = sasResponses || {};

sasResponses.loginSuccess = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<!-- NLS Version -->

<html>
<head>

<title>SAS Stored Process Web Application</title>

<script type="text/javascript">/*<![CDATA[*/
  window.enableContextMenu = true;

function toggleSamples() {
  var el;
  el = document.getElementById("samples");
  if (el.style.display=='block')
    el.style.display='none';
  else
    el.style.display='block';
}


window.onload = loadSamples;

function loadSamples() {

  var URL, parms;

  URL = "/SASStoredProcess/do?_action=search,form,properties,execute,nosort&_match=_Sample&_field=keywords&_columns=description&_path=/Products/SAS Intelligence Platform/Samples";

  parms = {
    url:    URL,
    load:   function(type, data, evt) {
              dojo.byId("sampleList").innerHTML = data;
            },
    error:  function(type, data, evt) {
              dojo.byId("sampleList").innerHTML = data;
            },
    method: "GET"
  };

  dojo.io.bind(parms);

}
/*]]>*/</script>
<script type="text/javascript" src="/SASStoredProcess/scripts/sas_Bootstrap.js"></script>
<script type="text/javascript" src="/SASStoredProcess/scripts/sas_Common.js"></script>
<script type="text/javascript">
var sas_framework_timeout;
function sas_framework_onTimeout() {
   var url = 'https://apps.boemskats.com/SASLogon/TimedOut.do?_locale=en_US&_sasapp=Stored+Process+Web+App+9.4';
   if(window.top){
		window.top.location.href = url;
   }
   else {
		window.location.href = url;
   }
}
function sas_framework_updateTimeout() {
   sas_framework_extendOtherSessions(window.top);
   sas_framework_updateFrameTimeout();
}
function sas_framework_extendOtherSessions(parentWindow) {
  if (parentWindow.frames.length > 0) {
		for (var i=0; i < parentWindow.frames.length; i++) {
		  try {
var f = parentWindow.frames[i];
if (f != self) {
			    if (f.frames.length > 0) {
		          sas_framework_extendOtherSessions(f);
		        }
		        if (typeof f.sas_framework_extendSession != 'undefined') {
		          f.sas_framework_extendSession();
		        }
		      }
		  }
		  catch (err) {}
		}
  }
}
function sas_framework_updateFrameTimeout() {
  self.clearTimeout(sas_framework_timeout);
  sas_framework_timeout = self.setTimeout('sas_framework_onTimeout()', 1800000);
}
function sas_framework_extendSession() {
  var timestamp = new Date();
	 var url = '/SASStoredProcess/Director?_sessionTouch=true&tstamp=' + timestamp.getTime();
   var xmlhttp = sas_createXMLHttpRequest();
   xmlhttp.open('POST', url, true);
   xmlhttp.send('');
  window.top.warningShown = null;
  sas_framework_updateFrameTimeout();
}
sas_framework_updateTimeout();
</script>




<link type="text/css" href="https://apps.boemskats.com/SASTheme_default/themes/default/styles/sasComponents_FF_5.css" rel="stylesheet" />

<link type="text/css" href="https://apps.boemskats.com/SASTheme_default/themes/default/styles/sasStyle.css" rel="stylesheet" />

<link type="text/css" href="https://apps.boemskats.com/SASTheme_default/themes/default/styles/custom.css" rel="stylesheet" />

<script language = Javascript>/*<![CDATA[*/
 var enableContextMenu = true;
/*]]>*/</script>
<link rel="shortcut icon" href="https://apps.boemskats.com/SASTheme_default/themes/default/images/favicon.ico"/>
<script type="text/javascript" src="/SASStoredProcess/scripts/sas_Bootstrap.js"></script>
<script type="text/javascript">/*<![CDATA[*/

sas.setJavaScriptLocation("/SASStoredProcess/scripts/");
sas.requires("sas_Common");
/*]]>*/</script>

<script type="text/javascript">/*<![CDATA[*/sas_includeDojo('/SASStoredProcess/scripts/dojo/');/*]]>*/</script>
<script type="text/javascript">/*<![CDATA[*/

dojo.event.connect(document,"onclick",function(e){dojo.event.topic.publish("Components.ClosePopups")})
dojo.event.connect(document,"onkeydown",function(e){if(e.keyCode==27){dojo.event.topic.publish("Components.ClosePopups")}})
/*]]>*/</script>

<script language = Javascript>/*<![CDATA[*/
function clearFrame (url) {
window.top.location.replace(url)
}
/*]]>*/</script>
</head><body>
<!-- Banner -->
<script type="text/javascript" src="/SASStoredProcess/scripts/SASDoc_window.js"></script>

<div id="banner" style="background-image:url(https://apps.boemskats.com/SASTheme_default/themes/default/images/BannerBackground.gif); "  class="banner_container">
<div class="banner_utilitybar_overlay">&nbsp;</div>
<table class="banner_utilitybar" cellpadding="0" cellspacing="0" width="100%">
	<tr valign="top">
		<!-- Skip to main content navigation link for screen readers -->
        <td class="bannerSkipNav"></td>
		<td class="banner_utilitybar_navigation" width="40%">
		</td>
		<td class="banner_userrole" nowrap="nowrap" align="center" width="20%">
		</td>
		<td width="40%"  valign="top"><span class="banner_global_menu"><a href="#globalMenuBar_skipMenuBar" title="Skip Menu Bar"></a>
 <script type="text/javascript">/*<![CDATA[*/sas.requires("TrimPath", "/SASStoredProcess/scripts/");/*]]>*/</script>
 <script type="text/javascript">/*<![CDATA[*/sas.requires("sas_SimpleMenuBar", "/SASStoredProcess/scripts/");/*]]>*/</script>
<script type="text/javascript">/*<![CDATA[*/
globalMenuBar = new sas.menu.SimpleMenuBar('globalMenuBar');
globalMenuBar.setModel({"id":"globalMenuBar","items":[{"title":"Log Off SAS Demo User","text":"Log Off SAS Demo User","url":"javascript: clearFrame(\"/SASStoredProcess/do?_action=logoff\")"}],"stockImageLocation":"https://apps.boemskats.com/SASTheme_default/themes/default/images/","images":{"spacer":"spacer.gif","menuDownArrowDisabled":"MenuDownArrowDisabled.gif","menuDownArrow":"MenuDownArrow.gif","menuDownArrow_White":"MenuDownArrowBanner.gif"}});
globalMenuBar.setStyles({"MENUITEM_ICON":" class=\"SimpleMenuBarIcon SimpleMenuBarIcon_Banner_GlobalMenu_Look\"","MENUITEM":" class=\"SimpleMenuBarItem SimpleMenuBarItem_Banner_GlobalMenu_Look\"","MENUITEM_SELECTED":" class=\"SimpleMenuBarItemSelected SimpleMenuBarItemSelected_Banner_GlobalMenu_Look\"","MENUITEM_HIGHLIGHT":"SimpleMenuBarItem SimpleMenuBarItemHighlight SimpleMenuBarItem SimpleMenuBarItemHighlight_Banner_GlobalMenu_Look","MENUBAR":" class=\"SimpleMenuBar SimpleMenuBar_Banner_GlobalMenu_Look\"","SEPARATOR":" class=\"SimpleMenuBarSeparator SimpleMenuBarSeparator_Banner_GlobalMenu_Look\"","MENUITEM_DISABLED":" class=\"SimpleMenuBarItemDisabled SimpleMenuBarItemDisabled_Banner_GlobalMenu_Look\"","MENUITEM_DISABLED_SELECTED":" class=\"SimpleMenuBarItemDisabled SimpleMenuBarItemSelected SimpleMenuBarItemDisabled SimpleMenuBarItemSelected_Banner_GlobalMenu_Look\"","MENUITEM_SPACER":" class=\"SimpleMenuBarItemSpacer SimpleMenuBarItemSpacer_Banner_GlobalMenu_Look\"","SUBMENU_INDICATOR":" class=\"SimpleMenuBarSubMenuIndicator SimpleMenuBarSubMenuIndicator_Banner_GlobalMenu_Look\""});
globalMenuBar.setLook('Banner_GlobalMenu_Look');
globalMenuBar.render();
/*]]>*/</script>

<a name="globalMenuBar_skipMenuBar"></a>
</span></td>
		<td width="1%">&nbsp;</td>
	</tr>
</table>

<table cellpadding="0" cellspacing="0" width="100%" >
	<tr>
		<td nowrap="nowrap" id="bantitle" class="banner_title">SAS Stored Process Web Application</td>
		<td id="banbullet" class="banner_bullet"></td>
		<td nowrap="nowrap" id="bantitle2" class="banner_secondaryTitle"></td>
		<td class="banner_logo" id="banlogo" class="banner_logo" width="100%"><img src="https://apps.boemskats.com/SASTheme_default/themes/default/images/logo.gif" width="62" height="24"" border="0" alt="" /></td>
		<td class="banner_logoPadding">&nbsp;</td>
	</tr>
</table>
</div>
	<table class="bannerDividerTable" width="100%" cellspacing="0" cellpadding="0">
	    <tr>
		    <td><div class="bannerDividerRow" align="left"
style="height:5px"></div></td>
	    </tr>
	</table>






<div style="margin-top: 15px; margin-left: 15px; margin-right: 15px;"><!-- Main body content -->


<p>
Welcome to the Version 9 SAS Stored Process Web Application.  This application allows you to execute SAS Stored Processes from a Web browser.
</p>

<form id="IndexForm" action="/SASStoredProcess/do" method="post">
  <input type="hidden" name="_action" value="index,form,properties,execute,newwindow" >
</form>
<form id="SearchForm" action="/SASStoredProcess/do" method="post">
  <input type="hidden" name="_action" value="search,form,properties,execute,newwindow" >
</form>
<form id="ReportForm" action="/SASStoredProcess/do" method="post">
  <input type="hidden" name="_action" value="index,form,properties,execute,newwindow" >
  <input type="hidden" name="_type" value="report" >
</form>


<script type="text/javascript">
var objIndexForm = document.getElementById("IndexForm");
var objSearchForm = document.getElementById("SearchForm");
var objReportForm = document.getElementById("ReportForm");
</script>

<ul>
<li><a title="Table of sample stored processes." href="javascript:toggleSamples()">Stored Process Samples</a></li>


<div id="samples" style="margin-left:15px; display:block">
<p>
The following samples display some of the capabilities of stored processes.  Many of the samples allow you to view the SAS log and see the SAS program used to generate the HTML or graphic output.  Click on one of the following program names to execute the stored process.
</p>

<div id="sampleList" name="sampleList" style="width:95%;"></div>

<br/>

</div>

<li><a title="Display a tree of all available stored processes and reports."  href="javascript:objIndexForm.submit()">List Available Stored Processes and Reports</a></li>
<li><a title="Search for available stored processes and reports." href="javascript:objSearchForm.submit()">Search for Stored Processes and Reports</a></li>
<li><a title="Access documentation from the SAS web site."href="http://support.sas.com/storedprocesses94">SAS Stored Processes: Developer's Guide</a>
- requires Internet access</li>
</ul>




</div><!-- Main body content -->


</body>

</html>`
