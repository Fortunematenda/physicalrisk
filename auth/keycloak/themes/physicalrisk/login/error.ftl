<#import "template.ftl" as layout>
<#assign differentUser = message?has_content && message.summary?contains("cannot be used here")>
<@layout.registrationLayout displayMessage=false; section>
  <#if section = "header">
    <h2 class="pr-title"><#if differentUser>Signed in as someone else<#else>Something went wrong</#if></h2>
    <p class="pr-subtitle"><#if differentUser>This link is for a different Physical Risk account.<#else>We could not complete that request.</#if></p>
  <#elseif section = "form">
    <div class="pr-alert pr-alert--error" role="alert">
      <#if message?has_content>
        ${kcSanitize(message.summary)?no_esc}
      <#else>
        An unexpected error occurred. Return to the portal and try again.
      </#if>
    </div>
    <#if differentUser>
      <div class="pr-actions" style="margin-top:1.25rem;">
        <a class="pr-btn pr-btn--block" id="pr-switch-account" href="https://apps.physicalrisk.com/?signedOut=1" style="display:none">Sign out and continue</a>
        <a class="pr-btn pr-btn--ghost pr-btn--block" href="https://apps.physicalrisk.com/">Stay signed in</a>
      </div>
      <script>
        (function () {
          var link = document.getElementById('pr-switch-account');
          var parts = location.pathname.split('/login-actions/action-token');
          if (!link || parts.length !== 2) return;
          link.href = parts[0] + '/protocol/openid-connect/logout';
          link.style.display = '';
          link.addEventListener('click', function () {
            try { sessionStorage.setItem('pr-pending-action', location.href); } catch (e) {}
          });
        })();
      </script>
    <#else>
      <p style="margin-top:1.25rem;text-align:center;">
        <a class="pr-link" href="https://apps.physicalrisk.com/?signedOut=1">Back to application</a>
      </p>
    </#if>
  </#if>
</@layout.registrationLayout>
