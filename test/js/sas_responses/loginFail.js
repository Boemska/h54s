var sasResponses = sasResponses || {};

sasResponses.loginFail = `
<html xmlns="http://www.w3.org/1999/xhtml" dir="ltr" class="bg">



<head>
    <meta charset="UTF-8" />
    <link rel="shortcut icon" href="themes/default/images/favicon.ico" />
    <title>



    			SAS&reg; Logon Manager


    </title>
    <!-- [if IE 9] -->
    <link type="text/css" rel="stylesheet" href="themes/default/css/sas_ie.css" />
    <link type="text/css" rel="stylesheet" href="themes/default/css/sas.css" />
    <meta name="viewport" content="initial-scale=1" />
</head>



    <div id="nonModal" class="block">
        <img src="themes/default/images/transparent.png" class="logo" alt="" /><!--customizable logo-->
        <h1 class="logotext" alt="">Sign In to SAS<sup class="reg">&#174;</sup></h1><!--Sign In to SAS-->

        <!--~~~~~~~~~~~~~~~~~~~~~MESSAGE CONTAINER~~~~~~~~~~~~~~~~~~~~~-->

        <div style='display:none;' id="nocookie-message" aria-hidden="true">
            <div id="message">
                <h2 class="primary">This application requires that your browser accept cookies.</h2>
                <p class="secondary">Change your browser settings accordingly.</p>
            </div>
        </div>






                <div id="message">




                                <h2 class="primary">The user ID or password is not valid.</h2>



                </div>



        <!--~~~~~~~~~~~~~~~~~~~~~MAIN CONTAINER~~~~~~~~~~~~~~~~~~~~~-->
        <div id="loginbox">
            <form id="fm1" class="minimal" onSubmit="return setSubmitUrl(this);" action="/SASLogon/login" method="post"><!--form container-->
                <label for="username">User ID:</label>
                <input id="username" name="username" tabindex="3" autofocus="true" type="text" value="asd" autocomplete="off"/>

                <label for="password">Password:</label>
                <input id="password" name="password" tabindex="4" type="password" value="" size="25" autocomplete="off"/>

                <input type="hidden" name="lt" value="LT-41-PZ2afc0z9xEYvB0cF5W5Hq0SCw5cvv" aria-hidden="true" />
                <input type="hidden" name="execution" value="e1s3" aria-hidden="true" />
                <input type="hidden" name="_eventId" value="submit" aria-hidden="true" />

                <button type="submit" class="btn-submit" title="Sign In" onClick="this.disabled=true;this.form.submit();return false;">Sign In</button>



                <div class="aboutcontainer"> <!--about link-->
                    <a href="#openModal" onClick="$('#openModal').show()" class="about" title="About">About</a>


<div class="copyright"><!--copyright statement-->
    &copy; 2002-2015 SAS Institute Inc.
</div>

                    <img src="themes/default/images/saslogo.svg" class="saslogo" />
                </div>
            </form>
        </div>


    </div>


<!--~~~~~~~~~~~~~~~~~~~~~ABOUT DIALOG MODAL CONTENT~~~~~~~~~~~~~~~~~-->

<div id="openModal" class="modalDialog" style="z-index: 9999;"><!--modal container-->
  <div>
    <div class="test">
      <div>&rlm;</div>
        <div><a href="" onClick="$('#openModal').hide();" title="Done" class="done">Done</a></div><!--done button-->
    </div>
       <!-- about dialog content -->
       <br />
      <p>Product name: SAS<sup>&reg;</sup> Logon Manager</p>
      <p>Release: 9.4</p>
      <h2>Legal Notices</h2>
      <p>Copyright  2002-2015, SAS Institute Inc., Cary, NC, USA. All Rights Reserved.
      This software is protected by copyright laws and international treaties.</p>
      <h3>U.S. Government Restricted Rights</h3>
      <p>Use, duplication or disclosure of this software and related documentation by the United States government is subject to the license terms of the Agreement with SAS Institute Inc. pursuant to, as applicable, FAR 12.212, DFAR 227.7202-1(a), DFAR 227.7202-3(a) and DFAR 227.7202-4 and, to the extent required under United States federal law, the minimum restricted rights as set out in FAR 52.227-19 (DEC 2007).</p>
      <h3>Third-Party Software Usage</h3>
      <h4>Central Authentication Service</h4>
      <p>Copyright &copy; 2007, JA-SIG, Inc. All rights reserved.</p>
      <p>Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:</p>
      <ul>
      <li><p>Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.</p></li>
      <li><p>Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.</p></li>
      <li><p>Neither the name of the JA-SIG, Inc. nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.</p></li>
      </ul>
      <p>THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
         "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
         LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
         A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR
         CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
         EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO,
         PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
         PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
         LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
         NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
          SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.</p>
      <p><a href="https://www.apereo.org/cas/license" style="color:white" target="_blank">https://www.apereo.org/cas/license</a></p>
  </div>
</div>







<script type="text/javascript" src="/SASLogon/js/jquery.js"></script>

<script type="text/javascript">
    $(document).on('keydown', function(e)
        {
            if (e.keyCode === 27)
            {
                $('#openModal').hide();
                document.location.href = '';
                return false;
            }
        });
</script>


<script type="text/javascript">
    function setSubmitUrl(form)
    {
        var urlHash = decodeURIComponent(window.location.hash);

        if (urlHash && urlHash.indexOf("#") === -1)
            urlHash = "#" + urlHash;

        form.action = form.action + urlHash;
        return true;
    }

    function are_cookies_enabled()
    {
        var cookieEnabled = (navigator.cookieEnabled) ? true : false;

        if (typeof navigator.cookieEnabled == "undefined")
        {
            document.cookie="testcookie";
            cookieEnabled = (document.cookie.indexOf("testcookie") != -1) ? true : false;
        }

        if (!cookieEnabled)
        {
            document.getElementById("nocookie-message").setAttribute("aria-hidden", "false");
            $('#nocookie-message').show();
        }
    }

    $(document).ready(function()
    {
        are_cookies_enabled();
    });

    function modality()
    {
        switch(location.hash)
        {
            case "#openModal" :
                $('#nonModal :input').attr('disabled', true);
                document.getElementById("nonModal").setAttribute("aria-hidden","true");
                document.getElementById("openModal").setAttribute("aria-hidden","false");
                break;
            default :
                $('#nonModal :input').attr('disabled', false);
                document.getElementById("nonModal").setAttribute("aria-hidden","false");
                document.getElementById("openModal").setAttribute("aria-hidden","true");
                break;
        }
    }
    window.onhashchange = modality;
    modality();
</script>


</html>
`
